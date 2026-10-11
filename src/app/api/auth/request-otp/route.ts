import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
});

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

function logAuthEvent(
  admin: ReturnType<typeof createAdminClient>,
  args: { actorId: string | null; email: string; event: string; ip: string; userAgent: string },
) {
  // Fire-and-forget: a logging failure must never block or crash the actual
  // auth flow.
  admin
    .rpc("log_auth_event", {
      p_actor_id: args.actorId,
      p_email: args.email,
      p_event: args.event,
      p_ip: args.ip,
      p_user_agent: args.userAgent,
    })
    .then(
      () => {},
      () => {},
    );
}

// Primer paso del login passwordless: envía un código de un solo uso al
// correo via Supabase Auth (email OTP nativo). shouldCreateUser:false es
// la unica barrera real contra que cualquier correo arbitrario se autoprovea
// una cuenta desde la pantalla de login — solo /api/auth/register puede
// crear cuentas nuevas. El rate limit, igual que en el login por contraseña
// que esto reemplaza, debe aplicarse server-side: un chequeo en el cliente
// es trivialmente evitable llamando a la API de Supabase directo con la
// anon key.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const { email } = parsed.data;
    const ip = getClientIp(request);
    const admin = createAdminClient();

    const { data: allowed } = await admin.rpc("check_auth_rate_limit", {
      p_scope: "login_otp",
      p_identifier: email,
      p_ip: ip,
      p_window_minutes: 15,
      p_max_attempts: 5,
    });

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    await admin.rpc("record_auth_attempt", { p_scope: "login_otp", p_identifier: email, p_ip: ip });

    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    // Respuesta deliberadamente idéntica exista o no la cuenta (anti
    // enumeración): Supabase devuelve error si el correo no existe y
    // shouldCreateUser es false, pero no lo exponemos al llamante.
    logAuthEvent(admin, {
      actorId: null,
      email,
      event: "otp_requested",
      ip,
      userAgent,
    });

    if (error) {
      console.error("[request-otp] signInWithOtp error", error.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
