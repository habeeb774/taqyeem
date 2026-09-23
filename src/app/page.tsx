import { redirect } from "next/navigation";
import { requireUser } from "@/server/context";

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

/*
const systems = [
  {
    title: 'نظام التقييم',
    description: 'إدارة تقييم أداء الموظفين',
    href: '/legacy.html',
    status: 'بانتظار الاختيار',
    action: 'دخول النظام',
    chips: ['متاح', 'حالي'],
    available: true,
  },
  {
    title: 'نظام النماذج',
    description: 'إدارة النماذج والإجراءات',
    href: '#',
    status: 'سيتم بناؤه قريبًا',
    action: 'سيتم بناؤه قريبًا',
    chips: ['قريبًا', 'لاحقًا'],
    available: false,
  },
];

export default function Home() {
  return (
    <main style={styles.page}>
      <header style={styles.topbar}>
        <div style={styles.topbarInner}>
          <div style={styles.brandMark}>ت</div>
          <div>
            <p style={styles.brandName}>منصة تقييم</p>
            <p style={styles.brandSub}>أنظمة الموارد والتشغيل</p>
          </div>
        </div>
      </header>

      <section style={styles.shell} aria-labelledby="home-title">
        <div style={styles.hero}>
          <span style={styles.monthPill}>الصفحة الرئيسية</span>
          <h1 id="home-title" style={styles.title}>اختر النظام</h1>
          <p style={styles.subtitle}>
            ادخل إلى نظام التقييم الحالي، أو تابع مساحة النماذج التي سيتم بناؤها قريبًا.
          </p>
        </div>

        <div style={styles.grid}>
          {systems.map((system) => (
            <a
              key={system.title}
              href={system.href}
              aria-disabled={!system.available}
              style={{
                ...styles.card,
                ...(system.available ? styles.cardAvailable : styles.cardSoon),
              }}
            >
              <div style={styles.cardTop}>
                <div style={styles.cardChips}>
                  {system.chips.map((chip) => (
                    <span key={chip} style={styles.topChip}>{chip}</span>
                  ))}
                </div>
                <span style={system.available ? styles.iconLive : styles.iconSoon}>
                  <span style={system.available ? styles.iconLineLive : styles.iconLineSoon} />
                </span>
              </div>
              <div style={styles.cardBody}>
                <h2 style={styles.cardTitle}>{system.title}</h2>
                <p style={styles.cardText}>{system.description}</p>
                <span style={system.available ? styles.badgeLive : styles.badgeSoon}>
                  {system.status}
                </span>
              </div>
              <span style={styles.cardDivider} />
              <span style={system.available ? styles.cardAction : styles.cardActionDisabled}>
                {system.action}
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    margin: 0,
    background: '#fbfcfe',
    color: '#0d0d0d',
    fontFamily: 'var(--app-font)',
    boxSizing: 'border-box',
  },
  topbar: {
    height: 64,
    background: '#173BD1',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    padding: '0 34px',
  },
  topbarInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.38)',
    background: 'rgba(255,255,255,.13)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 700,
  },
  brandName: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  brandSub: {
    margin: 0,
    color: 'rgba(255,255,255,.7)',
    fontSize: 11,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  shell: {
    width: 'min(900px, 100%)',
    margin: '0 auto',
    padding: '52px 34px 44px',
    boxSizing: 'border-box',
  },
  hero: {
    marginBottom: 30,
    textAlign: 'center',
  },
  monthPill: {
    display: 'inline-block',
    marginBottom: 18,
    color: '#173BD1',
    background: '#eef2fd',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.5,
  },
  title: {
    margin: '0 0 16px',
    fontSize: 28,
    lineHeight: 1.45,
    letterSpacing: '-.01em',
    fontWeight: 500,
    color: '#0d0d0d',
  },
  subtitle: {
    margin: 0,
    maxWidth: 650,
    marginInline: 'auto',
    color: '#888888',
    fontSize: 14,
    fontWeight: 300,
    lineHeight: 2,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, 256px)',
    justifyContent: 'center',
    gap: 18,
  },
  card: {
    minHeight: 294,
    borderRadius: 20,
    padding: 20,
    boxSizing: 'border-box',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    border: '1px solid #e0e0e0',
    boxShadow: '0 1px 4px rgba(0,0,0,.07)',
    transition: 'border-color .15s ease, box-shadow .15s ease, transform .15s ease',
  },
  cardAvailable: {
    background: '#ffffff',
    cursor: 'pointer',
  },
  cardSoon: {
    background: '#ffffff',
    cursor: 'default',
    pointerEvents: 'none',
    opacity: .72,
  },
  cardTop: {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 26,
  },
  cardChips: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  topChip: {
    height: 26,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #dcdfe6',
    borderRadius: 999,
    color: '#777777',
    background: '#ffffff',
    padding: '0 11px',
    fontSize: 11,
    fontWeight: 400,
  },
  iconLive: {
    width: 58,
    height: 58,
    borderRadius: 16,
    background: '#fff4d9',
    color: '#d89500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconLineLive: {
    width: 28,
    height: 2,
    background: '#d89500',
    borderRadius: 999,
  },
  iconLineSoon: {
    width: 28,
    height: 2,
    background: '#b7b7b7',
    borderRadius: 999,
  },
  iconSoon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    background: '#f2f2f2',
    color: '#888888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeLive: {
    color: '#c88700',
    background: '#fff2ca',
    border: '0',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 500,
    display: 'inline-flex',
    marginTop: 12,
  },
  badgeSoon: {
    color: '#888888',
    background: '#f7f7f7',
    border: '1px solid #e0e0e0',
    borderRadius: 999,
    padding: '4px 11px',
    fontSize: 11,
    fontWeight: 500,
    display: 'inline-flex',
    marginTop: 12,
  },
  cardBody: {
    flex: 1,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  cardTitle: {
    margin: '0 0 8px',
    color: '#0B0E14',
    fontSize: 18,
    lineHeight: 1.45,
    fontWeight: 500,
  },
  cardText: {
    margin: 0,
    color: '#888888',
    fontSize: 12,
    lineHeight: 1.75,
    fontWeight: 300,
  },
  cardDivider: {
    width: '100%',
    height: 5,
    borderRadius: 999,
    background: '#edf0f5',
    margin: '14px 0 16px',
  },
  cardAction: {
    width: '100%',
    height: 45,
    marginTop: 0,
    color: '#ffffff',
    background: '#173BD1',
    borderRadius: 13,
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 500,
  },
  cardActionDisabled: {
    width: '100%',
    height: 45,
    marginTop: 0,
    color: '#888888',
    background: '#f2f2f2',
    border: '1px solid #e0e0e0',
    borderRadius: 13,
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 500,
  },
} satisfies Record<string, React.CSSProperties>;
*/
