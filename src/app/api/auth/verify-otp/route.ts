import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().trim().regex(/^\d{6}$/),
});

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

function logAuthEvent(
  admin: ReturnType<typeof createAdminClient>,
  args: { actorId: string | null; email: string; event: string; ip: string; userAgent: string },
) {
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

// Segundo paso del login passwordless: canjea el código de 6 dígitos por
// una sesión real via Supabase Auth. Igual que el login por contraseña que
// esto reemplaza, el canje ocurre server-side (createClient() de
// @/lib/supabase/server, con @supabase/ssr) para que la sesión resultante
// quede en las cookies de la respuesta, y para que el rate limit de intentos
// sea real en vez de evitable desde el navegador.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const { email, code } = parsed.data;
    const ip = getClientIp(request);
    const admin = createAdminClient();

    const { data: allowed } = await admin.rpc("check_auth_rate_limit", {
      p_scope: "verify_otp",
      p_identifier: email,
      p_ip: ip,
      p_window_minutes: 30,
      p_max_attempts: 5,
    });

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

    if (error || !data.user) {
      await admin.rpc("record_auth_attempt", { p_scope: "verify_otp", p_identifier: email, p_ip: ip });
      logAuthEvent(admin, { actorId: null, email, event: "otp_verify_failure", ip, userAgent });
      return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
    }

    logAuthEvent(admin, {
      actorId: data.user.id,
      email,
      event: "otp_verify_success",
      ip,
      userAgent,
    });

    const { data: staffUser } = await supabase
      .from("staff_users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const destination = staffUser
      ? staffUser.role === "super_admin"
        ? "/superadmin"
        : "/admin"
      : "/portal/dashboard";

    return NextResponse.json({ ok: true, destination });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
