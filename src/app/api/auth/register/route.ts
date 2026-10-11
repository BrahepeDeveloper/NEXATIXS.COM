import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(200),
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

// Autorregistro público de clientes: crea la cuenta (sin contraseña) y la
// empresa de una vez, y envía el primer código de acceso por correo. Debe
// correr con la service role key (createAdminClient): crear un usuario de
// Supabase Auth y escribir en clients/client_users directamente requiere
// saltarse RLS, porque todavía no existe ninguna sesión autenticada en este
// punto del flujo.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const { companyName, contactName, email } = parsed.data;
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const admin = createAdminClient();

    const { data: allowed } = await admin.rpc("check_auth_rate_limit", {
      p_scope: "register",
      p_identifier: email,
      p_ip: ip,
      p_window_minutes: 60,
      p_max_attempts: 5,
    });

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    await admin.rpc("record_auth_attempt", { p_scope: "register", p_identifier: email, p_ip: ip });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createError || !created.user) {
      // Ya existe un usuario con ese correo (u otro fallo de Supabase Auth).
      // No distinguimos el motivo exacto en la respuesta: evita confirmar a
      // un atacante que un correo especifico ya tiene cuenta.
      return NextResponse.json({ ok: false, error: "registration_failed" }, { status: 400 });
    }

    const userId = created.user.id;

    const { data: client, error: clientError } = await admin
      .from("clients")
      .insert({ company_name: companyName })
      .select("id")
      .single();

    if (clientError || !client) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ ok: false, error: "registration_failed" }, { status: 500 });
    }

    const { error: clientUserError } = await admin.from("client_users").insert({
      id: userId,
      client_id: client.id,
      full_name: contactName,
      role: "admin_cliente",
    });

    if (clientUserError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ ok: false, error: "registration_failed" }, { status: 500 });
    }

    logAuthEvent(admin, { actorId: userId, email, event: "client_registered", ip, userAgent });

    // Primer código de acceso, mismo flujo que /api/auth/request-otp.
    const supabase = await createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (otpError) {
      console.error("[register] signInWithOtp error", otpError.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
