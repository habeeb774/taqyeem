import { redirect } from "next/navigation";
import { requireUser } from "@/server/context";
import { SystemTopbar } from "@/components/SystemTopbar";
import { availableTasks } from "@/server/tasks";

// Authentication is the application entry point. The system selector is
// reached only after the user has authenticated inside the legacy shell.
// The public jobs board lives on its own site (jobs.alsweed.sa), which
// consumes this app's public API rather than sharing this domain's root.
export default async function Home() {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const can = (permission: string) => user.permissions.includes(permission);
  const tasks = availableTasks(user.permissions, Boolean(user.user.employeeId));
  const systems = [
    can("evaluations.view") && {
      title: "نظام التقييم",
      description: "إدارة تقييم أداء الموظفين ودورات التقييم",
      href: "/assessment",
      icon: "◔",
      color: "var(--dst-color-primary)",
    },
    can("forms.view") && {
      title: "النماذج الإدارية",
      description: "إنشاء النماذج والمستندات وحفظ سجلاتها",
      href: "/forms",
      icon: "▤",
      color: "var(--dst-color-accent-1)",
    },
    can("design_templates.view") && {
      title: "نظام التصاميم",
      description: "إدارة قوالب التصميم ومحتواها",
      href: "/design-templates",
      icon: "✦",
      color: "var(--dst-color-accent-2)",
    },
    can("recruitment.jobs.view") && {
      title: "نظام التوظيف",
      description: "إدارة الوظائف الشاغرة وطلبات المتقدمين",
      href: "/admin/recruitment",
      icon: "👥",
      color: "var(--dst-color-accent-3)",
    },
    user.user.employeeId && {
      title: "تقييمي",
      description: "عرض تقييمك الشخصي وطلب مراجعة عند الحاجة",
      href: "/my-evaluations",
      icon: "✓",
      color: "var(--dst-color-accent-4)",
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
        background: "var(--dst-color-bg-page)",
        color: "var(--dst-color-text)",
        fontFamily: "var(--app-font)",
      }}
    >
      <SystemTopbar showSettings={can("settings.manage")} />
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
              color: "var(--dst-color-primary)",
              background: "#eef2fd",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
            }}
          >
            الصفحة الرئيسية
          </span>
          <h1 style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 500 }}>
            {tasks.length ? 'ماذا تريد إنجازه؟' : 'اختر النظام'}
          </h1>
          <p style={{ margin: 0, color: "var(--dst-color-text-muted)", fontSize: 14, lineHeight: 2 }}>
            مرحبًا، {user.user.name || user.user.email}. {tasks.length ? 'اختر مهمة مباشرة، أو افتح أحد الأنظمة المتاحة لك.' : 'افتح أحد الأنظمة المتاحة لك.'}
          </p>
        </div>
        {tasks.length > 0 && (
          <nav aria-label="مهام متاحة لك" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginBottom: 28 }}>
            {tasks.map(task => (
              <a key={task.href} href={task.href} className="dst-btn dst-btn--primary dst-btn--md">{task.label}</a>
            ))}
          </nav>
        )}
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
              className="dst-card"
              style={{
                minHeight: 294,
                padding: 20,
                boxSizing: "border-box",
                textDecoration: "none",
                color: "var(--dst-color-text)",
                borderRadius: 20,
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
                    color: "var(--dst-color-text-muted)",
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
              <span className="dst-btn dst-btn--primary dst-btn--md" style={{ width: "100%" }}>
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
