import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signOut } from "@/auth";
import { pool } from "@/db";
import { requireUser } from "@/server/context";

async function logout() {
  "use server";
  const cookieStore = await cookies();
  const token = cookieStore.get("taqyeem_session")?.value;
  if (token) {
    await pool
      .query("delete from public.sessions where session_token = $1", [token])
      .catch(() => undefined);
  }
  cookieStore.delete("taqyeem_session");
  await signOut({ redirect: false });
  redirect("/login");
}

// Authentication is the application entry point. The system selector is
// reached only after the user has authenticated inside the legacy shell.
export default async function Home() {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const can = (permission: string) => user.permissions.includes(permission);
  const systems = [
    can("evaluations.view") && {
      title: "نظام التقييم",
      description: "إدارة تقييم أداء الموظفين ودورات التقييم",
      href: "/assessment",
      icon: "◔",
      color: "#2445d9",
    },
    can("forms.view") && {
      title: "النماذج الإدارية",
      description: "إنشاء النماذج والمستندات وحفظ سجلاتها",
      href: "/forms",
      icon: "▤",
      color: "#0f766e",
    },
    can("design_templates.view") && {
      title: "نظام التصاميم",
      description: "إدارة قوالب التصميم ومحتواها",
      href: "/design-templates",
      icon: "✦",
      color: "#7c3aed",
    },
    user.user.employeeId && {
      title: "تقييمي",
      description: "عرض تقييمك الشخصي وطلب مراجعة عند الحاجة",
      href: "/my-evaluations",
      icon: "✓",
      color: "#16a34a",
    },
  ].filter(Boolean) as {
    title: string;
    description: string;
    href: string;
    icon: string;
    color: string;
  }[];

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#fbfcfe",
        color: "#0d0d0d",
        fontFamily: "var(--app-font)",
      }}
    >
      <header
        style={{
          height: 64,
          background: "#173BD1",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 34px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.38)",
              background: "rgba(255,255,255,.13)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <img
              src="/brand-logo.png"
              alt="شعار السويد"
              style={{
                width: 23,
                height: 29,
                objectFit: "contain",
                filter: "brightness(0) invert(1)",
              }}
            />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              منصة تقييم
            </p>
            <p
              style={{ margin: 0, color: "rgba(255,255,255,.7)", fontSize: 11 }}
            >
              أنظمة الموارد والتشغيل
            </p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            style={{
              height: 38,
              border: "1px solid rgba(255,255,255,.32)",
              borderRadius: 10,
              background: "rgba(255,255,255,.1)",
              color: "#fff",
              padding: "0 14px",
              fontFamily: "var(--app-font)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            خروج
          </button>
        </form>
      </header>
      <section
        style={{
          width: "min(900px, 100%)",
          margin: "0 auto",
          padding: "52px 34px 44px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: 30, textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              marginBottom: 18,
              color: "#173BD1",
              background: "#eef2fd",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
            }}
          >
            الصفحة الرئيسية
          </span>
          <h1 style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 500 }}>
            اختر النظام
          </h1>
          <p style={{ margin: 0, color: "#888", fontSize: 14, lineHeight: 2 }}>
            مرحبًا، {user.user.name || user.user.email}. انتقل إلى أحد الأنظمة
            المتاحة لك.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, 256px)",
            justifyContent: "center",
            gap: 18,
          }}
        >
          {systems.map((system) => (
            <a
              key={system.href}
              href={system.href}
              style={{
                minHeight: 294,
                padding: 20,
                boxSizing: "border-box",
                textDecoration: "none",
                color: "#0d0d0d",
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: 20,
                boxShadow: "0 1px 4px rgba(0,0,0,.07)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 26,
                }}
              >
                <span
                  style={{
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    border: "1px solid #dcdfe6",
                    borderRadius: 999,
                    color: "#777",
                    padding: "0 11px",
                    fontSize: 11,
                  }}
                >
                  متاح
                </span>
                <span
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 16,
                    background: "#fff4d9",
                    color: system.color,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 25,
                  }}
                >
                  {system.icon}
                </span>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <h2
                  style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 500 }}
                >
                  {system.title}
                </h2>
                <p
                  style={{
                    margin: 0,
                    color: "#888",
                    fontSize: 12,
                    lineHeight: 1.75,
                  }}
                >
                  {system.description}
                </p>
                <span
                  style={{
                    color: "#c88700",
                    background: "#fff2ca",
                    borderRadius: 999,
                    padding: "4px 12px",
                    fontSize: 12,
                    display: "inline-flex",
                    marginTop: 12,
                  }}
                >
                  جاهز للاستخدام
                </span>
              </div>
              <span
                style={{
                  width: "100%",
                  height: 5,
                  borderRadius: 999,
                  background: "#edf0f5",
                  margin: "14px 0 16px",
                }}
              />
              <span
                style={{
                  width: "100%",
                  height: 45,
                  color: "#fff",
                  background: "#173BD1",
                  borderRadius: 13,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                دخول النظام
              </span>
            </a>
          ))}
        </div>
        {!systems.length && (
          <p style={{ marginTop: 32, textAlign: "center", color: "#64748b" }}>
            لا توجد أنظمة متاحة لحسابك حاليًا.
          </p>
        )}
      </section>
    </main>
  );
}
