"use client";
import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { DesignShell, designApi } from "@/components/design-shell";

type Field = {
  id?: string;
  layer_name: string;
  field_key: string;
  field_label: string;
  field_type: string;
  content: string;
  default_value: string | null;
  placeholder: string | null;
  is_dynamic: boolean;
  is_required: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  font_family: string;
  font_size: number;
  font_weight: number;
  font_color: string;
  text_align: "left" | "center" | "right";
  direction: "rtl" | "ltr" | "auto";
  line_height: number;
  letter_spacing: number;
  rotation: number;
  opacity: number;
  multiline: boolean;
  auto_fit: boolean;
  min_font_size: number;
  max_font_size: number;
  max_length: number | null;
  is_visible: boolean;
  is_locked: boolean;
  z_index: number;
  sort_order: number;
  options: (string | number)[];
};
const numeric = [
  "x",
  "y",
  "width",
  "height",
  "font_size",
  "font_weight",
  "line_height",
  "letter_spacing",
  "rotation",
  "opacity",
  "min_font_size",
  "max_font_size",
  "max_length",
  "z_index",
  "sort_order",
];
function tokens(content: string) {
  return Array.from(
    content.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g),
    (match) => match[1],
  );
}
function normalize(f: any): Field {
  const n = { ...f };
  numeric.forEach((k) => {
    if (n[k] != null) n[k] = Number(n[k]);
  });
  return n as Field;
}
function fresh(index: number): Field {
  return {
    layer_name: `نص إضافي ${index}`,
    field_key: `text_${Date.now().toString(36)}_${index}`,
    field_label: `نص إضافي ${index}`,
    field_type: "text",
    content: "نص جديد",
    default_value: "",
    placeholder: "اكتب النص",
    is_dynamic: false,
    is_required: false,
    x: 40 + index * 12,
    y: 40 + index * 12,
    width: 360,
    height: 80,
    font_family: "Alexandria",
    font_size: 32,
    font_weight: 500,
    font_color: "#111827",
    text_align: "center",
    direction: "rtl",
    line_height: 1.4,
    letter_spacing: 0,
    rotation: 0,
    opacity: 1,
    multiline: true,
    auto_fit: true,
    min_font_size: 10,
    max_font_size: 200,
    max_length: null,
    is_visible: true,
    is_locked: false,
    z_index: index,
    sort_order: index,
    options: [],
  };
}
export default function EditorPage() {
  const { id } = useParams<{ id: string }>(),
    router = useRouter();
  const [template, setTemplate] = useState<any>(null),
    [fields, setFields] = useState<Field[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [fonts, setFonts] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [zoom, setZoom] = useState(0.6),
    [status, setStatus] = useState<
      "idle" | "dirty" | "saving" | "saved" | "error"
    >("idle"),
    [message, setMessage] = useState(""),
    [guide, setGuide] = useState<{ x?: number; y?: number }>({}),
    [deletePrompt, setDeletePrompt] = useState<{
      index: number;
      canKeep: boolean;
      usedElsewhere: boolean;
    } | null>(null);
  const history = useRef<Field[][]>([]),
    future = useRef<Field[][]>([]),
    loaded = useRef(false),
    saving = useRef(false),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    drag = useRef<any>(null);
  const selectedField = selected == null ? null : fields[selected];
  const pushHistory = useCallback(
    (snapshot = fields) => {
      history.current.push(
        snapshot.map((x) => ({ ...x, options: [...x.options] })),
      );
      if (history.current.length > 80) history.current.shift();
      future.current = [];
    },
    [fields],
  );
  async function load() {
    try {
      const [d, f, c] = await Promise.all([
        designApi(`/api/design-templates/${id}`),
        designApi("/api/design-fonts"),
        designApi("/api/design-categories"),
      ]);
      setTemplate(d.template);
      setFields(d.fields.map(normalize));
      setFonts(f.fonts);
      setCategories(c.categories);
      loaded.current = true;
    } catch (e: any) {
      setMessage(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  const save = useCallback(
    async (next = fields, meta = template) => {
      if (!loaded.current || saving.current || !meta) return;
      saving.current = true;
      setStatus("saving");
      try {
        const response = await designApi(`/api/design-templates/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: meta.name,
            description: meta.description || null,
            category_id: meta.category_id || null,
            background_image_url: meta.background_image_url || null,
            background_storage_key: meta.background_storage_key || null,
            thumbnail_url:
              meta.thumbnail_url || meta.background_image_url || null,
            thumbnail_storage_key:
              meta.thumbnail_storage_key || meta.background_storage_key || null,
            width: Number(meta.width),
            height: Number(meta.height),
            status: meta.status,
            notes: meta.notes || null,
            fields: next,
          }),
        });
        if (Array.isArray(response.fields))
          setFields(response.fields.map(normalize));
        setStatus("saved");
      } catch (e: any) {
        setStatus("error");
        setMessage(e.message);
      } finally {
        saving.current = false;
      }
    },
    [id, fields, template],
  );
  useEffect(() => {
    if (!loaded.current || status !== "dirty") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(fields, template), 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [fields, template, status, save]);
  function mutate(fn: (a: Field[]) => Field[], remember = true) {
    setFields((prev) => {
      if (remember) pushHistory(prev);
      return fn(prev);
    });
    setStatus("dirty");
  }
  function update(key: keyof Field, value: any, remember = true) {
    if (selected == null) return;
    mutate(
      (a) => a.map((f, i) => (i === selected ? { ...f, [key]: value } : f)),
      remember,
    );
  }
  function addText(dynamic = false) {
    const f = fresh(fields.length + 1);
    if (dynamic) {
      f.layer_name = `متغير ${fields.length + 1}`;
      f.field_label = f.layer_name;
      f.field_key = `variable_${Date.now().toString(36)}`;
      f.content = `{{${f.field_key}}}`;
      f.is_dynamic = true;
    }
    pushHistory();
    setFields((a) => [...a, f]);
    setSelected(fields.length);
    setStatus("dirty");
  }
  function remove() {
    if (selected == null) return;
    const f = fields[selected],
      keys = Array.from(
        new Set([...tokens(f.content), ...(f.is_dynamic ? [f.field_key] : [])]),
      );
    if (!keys.length) {
      commitRemove(selected, false);
      return;
    }
    const usedElsewhere = fields.some(
      (x, i) =>
        i !== selected &&
        [x.field_key, ...tokens(x.content)].some((key) => keys.includes(key)),
    );
    setDeletePrompt({
      index: selected,
      canKeep: f.is_dynamic && !usedElsewhere,
      usedElsewhere,
    });
  }
  function commitRemove(index: number, keepField: boolean) {
    mutate((a) => {
      if (keepField) {
        return a.map((f, i) =>
          i === index
            ? {
                ...f,
                layer_name: `حقل محفوظ: ${f.field_label || f.field_key}`,
                content: "",
                is_visible: false,
                is_locked: true,
                z_index: 1,
                sort_order: 1,
              }
            : f,
        );
      }
      return a
        .filter((_, i) => i !== index)
        .map((x, i) => ({ ...x, z_index: i + 1, sort_order: i + 1 }));
    });
    setSelected(null);
    setDeletePrompt(null);
  }
  function duplicate() {
    if (selected == null) return;
    const s = fields[selected],
      copy = {
        ...s,
        id: undefined,
        layer_name: `${s.layer_name} - نسخة`,
        field_key: `${s.field_key}_copy_${Date.now().toString(36)}`,
        x: s.x + 12,
        y: s.y + 12,
        z_index: fields.length + 1,
        sort_order: fields.length + 1,
      };
    pushHistory();
    setFields((a) => [...a, copy]);
    setSelected(fields.length);
    setStatus("dirty");
  }
  function reorder(from: number, to: number) {
    if (to < 0 || to >= fields.length || from === to) return;
    mutate((a) => {
      const n = [...a],
        x = n.splice(from, 1)[0];
      n.splice(to, 0, x);
      return n.map((f, i) => ({ ...f, z_index: i + 1, sort_order: i + 1 }));
    });
    setSelected(to);
  }
  function undo() {
    const s = history.current.pop();
    if (!s) return;
    future.current.push(fields);
    setFields(s);
    setSelected(null);
    setStatus("dirty");
  }
  function redo() {
    const s = future.current.pop();
    if (!s) return;
    history.current.push(fields);
    setFields(s);
    setSelected(null);
    setStatus("dirty");
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected != null) {
        e.preventDefault();
        remove();
        return;
      }
      if (
        selected != null &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1,
          dx =
            e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
          dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        pushHistory();
        setFields((a) =>
          a.map((f, i) =>
            i === selected ? { ...f, x: f.x + dx, y: f.y + dy } : f,
          ),
        );
        setStatus("dirty");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [fields, selected]);
  function pointerDown(
    e: ReactPointerEvent,
    index: number,
    mode: "move" | "resize",
  ) {
    e.preventDefault();
    e.stopPropagation();
    const f = fields[index];
    if (f.is_locked) return;
    setSelected(index);
    pushHistory();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      index,
      sx: e.clientX,
      sy: e.clientY,
      x: f.x,
      y: f.y,
      w: f.width,
      h: f.height,
    };
  }
  function pointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom,
      dy = (e.clientY - d.sy) / zoom;
    setFields((a) =>
      a.map((f, i) =>
        i === d.index
          ? d.mode === "move"
            ? { ...f, x: Math.round(d.x + dx), y: Math.round(d.y + dy) }
            : {
                ...f,
                width: Math.max(20, Math.round(d.w - dx)),
                height: Math.max(20, Math.round(d.h + dy)),
              }
          : f,
      ),
    );
    const f = fields[d.index],
      cx = (d.mode === "move" ? d.x + dx : f.x) + f.width / 2,
      cy = (d.mode === "move" ? d.y + dy : f.y) + f.height / 2;
    setGuide({
      x: Math.abs(cx - template.width / 2) < 8 ? template.width / 2 : undefined,
      y:
        Math.abs(cy - template.height / 2) < 8
          ? template.height / 2
          : undefined,
    });
    setStatus("dirty");
  }
  function pointerUp() {
    drag.current = null;
    setGuide({});
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("الملف يجب أن يكون PNG أو JPG أو WEBP");
      return;
    }
    const img = new Image();
    img.onload = async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "backgrounds");
        const a = await designApi("/api/design-assets", {
          method: "POST",
          body: fd,
        });
        setTemplate((t: any) => ({
          ...t,
          background_image_url: a.url,
          background_storage_key: a.key,
          thumbnail_url: a.url,
          thumbnail_storage_key: a.key,
          width: img.naturalWidth,
          height: img.naturalHeight,
        }));
        setStatus("dirty");
      } catch (x: any) {
        setMessage(x.message);
      }
    };
    img.src = URL.createObjectURL(file);
  }
  function align(kind: string) {
    if (selected == null) return;
    const f = fields[selected];
    pushHistory();
    if (kind === "h") update("x", (template.width - f.width) / 2, false);
    if (kind === "v") update("y", (template.height - f.height) / 2, false);
    if (kind === "top") update("y", 0, false);
    if (kind === "bottom") update("y", template.height - f.height, false);
  }
  async function publish() {
    if (!template.background_image_url) {
      setMessage("ارفع صورة الخلفية قبل النشر");
      return;
    }
    if (!fields.length) {
      setMessage("أضف طبقة نص واحدة على الأقل");
      return;
    }
    const next = { ...template, status: "published" };
    setTemplate(next);
    await save(fields, next);
    setMessage("تم نشر القالب");
  }
  if (!template)
    return (
      <DesignShell>
        <div className="ds-loading">{message || "جارٍ فتح المحرر..."}</div>
      </DesignShell>
    );
  return (
    <DesignShell>
      <main className="de-page">
        <div className="de-toolbar">
          <button
            className="ds-btn ghost"
            onClick={() => router.push("/design-templates")}
          >
            رجوع
          </button>
          <button className="ds-btn" onClick={() => addText(false)}>
            + إضافة نص
          </button>
          <button className="ds-btn ghost" onClick={() => addText(true)}>
            + إنشاء متغير
          </button>
          <button
            className="ds-btn ghost"
            disabled={selected == null}
            onClick={duplicate}
          >
            نسخ النص
          </button>
          <button
            className="ds-btn danger"
            disabled={selected == null}
            onClick={remove}
          >
            حذف النص
          </button>
          <button
            className="ds-btn ghost"
            disabled={!history.current.length}
            onClick={undo}
          >
            تراجع
          </button>
          <button
            className="ds-btn ghost"
            disabled={!future.current.length}
            onClick={redo}
          >
            إعادة
          </button>
          <span className="spacer" />
          <button
            className="ds-btn ghost"
            onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))}
          >
            −
          </button>
          <span style={{ fontSize: 11 }}>{Math.round(zoom * 100)}%</span>
          <button
            className="ds-btn ghost"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          >
            +
          </button>
          <span
            className={`de-status ${status === "saved" ? "ok" : status === "error" ? "error" : ""}`}
          >
            {status === "saving"
              ? "جاري الحفظ..."
              : status === "saved"
                ? "تم الحفظ ✓"
                : status === "error"
                  ? "فشل الحفظ"
                  : status === "dirty"
                    ? "تغييرات غير محفوظة"
                    : ""}
          </span>
          <button className="ds-btn" onClick={publish}>
            نشر القالب
          </button>
        </div>
        <div className="de-work">
          <aside className="de-panel layers">
            <h2>الطبقات</h2>
            <div className="de-bg-row">
              <span>🔒</span>
              <b>الخلفية</b>
            </div>
            {[...fields].map((f, i) => (
              <div
                key={f.id || f.field_key}
                className={`de-layer-row ${selected === i ? "active" : ""}`}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", String(i))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  reorder(Number(e.dataTransfer.getData("text/plain")), i)
                }
                onClick={() => setSelected(i)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    update("is_visible", !f.is_visible);
                  }}
                >
                  {f.is_visible ? "👁" : "—"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    update("is_locked", !f.is_locked);
                  }}
                >
                  {f.is_locked ? "🔒" : "🔓"}
                </button>
                <span className="de-layer-name">{f.layer_name}</span>
                <span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reorder(i, i - 1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reorder(i, i + 1);
                    }}
                  >
                    ↓
                  </button>
                </span>
              </div>
            ))}
            <div className="de-help">
              اسحب الطبقات لترتيبها. الأسهم تعني Bring Forward وSend Backward،
              والخلفية تبقى مقفلة في الأسفل.
            </div>
          </aside>
          <section className="de-stage">
            <div
              className="de-canvas-wrap"
              style={{
                width: template.width * zoom,
                height: template.height * zoom,
              }}
            >
              <div
                className="de-canvas"
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                onClick={() => setSelected(null)}
                style={{
                  width: template.width,
                  height: template.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top right",
                  backgroundImage: template.background_image_url
                    ? `url(${template.background_image_url})`
                    : undefined,
                }}
              >
                {guide.x != null && (
                  <span
                    className="de-smart-guide v"
                    style={{ right: guide.x }}
                  />
                )}
                {guide.y != null && (
                  <span className="de-smart-guide h" style={{ top: guide.y }} />
                )}
                {fields.map(
                  (f, i) =>
                    f.is_visible && (
                      <div
                        key={f.id || f.field_key}
                        className={`de-layer ${selected === i ? "selected" : ""} ${f.is_locked ? "locked" : ""}`}
                        onPointerDown={(e) => pointerDown(e, i, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(i);
                        }}
                        style={{
                          right: f.x,
                          top: f.y,
                          width: f.width,
                          height: f.height,
                          fontFamily: f.font_family,
                          fontSize: f.font_size,
                          fontWeight: f.font_weight,
                          color: f.font_color,
                          textAlign: f.text_align,
                          direction:
                            f.direction === "auto" ? undefined : f.direction,
                          lineHeight: f.line_height,
                          letterSpacing: f.letter_spacing,
                          opacity: f.opacity,
                          transform: `rotate(${f.rotation}deg)`,
                          zIndex: f.z_index,
                          justifyContent:
                            f.text_align === "center"
                              ? "center"
                              : f.text_align === "left"
                                ? "flex-end"
                                : "flex-start",
                        }}
                      >
                        {f.content}
                        {selected === i && !f.is_locked && (
                          <span
                            className="de-resize"
                            onPointerDown={(e) => pointerDown(e, i, "resize")}
                          />
                        )}
                      </div>
                    ),
                )}
              </div>
            </div>
          </section>
          <aside className="de-panel">
            <div className="de-section">
              <h2>بيانات القالب</h2>
              <div className="de-fields">
                <label className="ds-field full">
                  الاسم
                  <input
                    className="ds-input"
                    value={template.name}
                    onChange={(e) => {
                      setTemplate({ ...template, name: e.target.value });
                      setStatus("dirty");
                    }}
                  />
                </label>
                <label className="ds-field full">
                  الوصف
                  <textarea
                    className="ds-textarea"
                    value={template.description || ""}
                    onChange={(e) => {
                      setTemplate({ ...template, description: e.target.value });
                      setStatus("dirty");
                    }}
                  />
                </label>
                <label className="ds-field full">
                  التصنيف
                  <select
                    className="ds-select"
                    value={template.category_id || ""}
                    onChange={(e) => {
                      setTemplate({
                        ...template,
                        category_id: e.target.value || null,
                      });
                      setStatus("dirty");
                    }}
                  >
                    <option value="">بدون تصنيف</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ds-field full">
                  صورة الخلفية
                  <input
                    className="ds-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={upload}
                  />
                </label>
                <span className="ds-field">
                  العرض
                  <input
                    className="ds-input"
                    type="number"
                    value={template.width}
                    onChange={(e) => {
                      setTemplate({
                        ...template,
                        width: Number(e.target.value),
                      });
                      setStatus("dirty");
                    }}
                  />
                </span>
                <span className="ds-field">
                  الارتفاع
                  <input
                    className="ds-input"
                    type="number"
                    value={template.height}
                    onChange={(e) => {
                      setTemplate({
                        ...template,
                        height: Number(e.target.value),
                      });
                      setStatus("dirty");
                    }}
                  />
                </span>
              </div>
            </div>
            {selectedField ? (
              <>
                <div className="de-section">
                  <h2>خصائص النص</h2>
                  <div className="de-fields">
                    <F label="اسم الطبقة" k="layer_name" full />
                    <F label="مفتاح الحقل" k="field_key" />
                    <F label="اسم الحقل" k="field_label" />
                    <label className="ds-field full">
                      المحتوى
                      <textarea
                        className="ds-textarea"
                        rows={3}
                        value={selectedField.content}
                        onChange={(e) => update("content", e.target.value)}
                      />
                    </label>
                    <label className="ds-field">
                      نوع النص
                      <select
                        className="ds-select"
                        value={selectedField.is_dynamic ? "dynamic" : "static"}
                        onChange={(e) =>
                          update("is_dynamic", e.target.value === "dynamic")
                        }
                      >
                        <option value="static">نص ثابت</option>
                        <option value="dynamic">نص متغير</option>
                      </select>
                    </label>
                    <label className="ds-field">
                      نوع الحقل
                      <select
                        className="ds-select"
                        value={selectedField.field_type}
                        onChange={(e) => update("field_type", e.target.value)}
                      >
                        {[
                          "text",
                          "textarea",
                          "number",
                          "date",
                          "select",
                          "employee",
                          "department",
                          "branch",
                          "job_title",
                          "custom",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ds-field full">
                      خيارات القائمة (افصل بفاصلة)
                      <input
                        className="ds-input"
                        value={(selectedField.options || []).join(", ")}
                        onChange={(e) =>
                          update(
                            "options",
                            e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          )
                        }
                      />
                    </label>
                    <F label="النص الافتراضي" k="default_value" />
                    <F label="Placeholder" k="placeholder" />
                    <label className="ds-field">
                      <input
                        type="checkbox"
                        checked={selectedField.is_required}
                        onChange={(e) =>
                          update("is_required", e.target.checked)
                        }
                      />{" "}
                      مطلوب
                    </label>
                    <label className="ds-field">
                      <input
                        type="checkbox"
                        checked={selectedField.multiline}
                        onChange={(e) => update("multiline", e.target.checked)}
                      />{" "}
                      متعدد الأسطر
                    </label>
                  </div>
                </div>
                <div className="de-section">
                  <h2>الموضع والحجم</h2>
                  <div className="de-fields">
                    <N label="X" k="x" />
                    <N label="Y" k="y" />
                    <N label="العرض" k="width" />
                    <N label="الارتفاع" k="height" />
                  </div>
                  <div className="de-mini-actions" style={{ marginTop: 9 }}>
                    <button className="ds-btn ghost" onClick={() => align("h")}>
                      توسيط أفقي
                    </button>
                    <button className="ds-btn ghost" onClick={() => align("v")}>
                      توسيط رأسي
                    </button>
                    <button
                      className="ds-btn ghost"
                      onClick={() => align("top")}
                    >
                      أعلى
                    </button>
                    <button
                      className="ds-btn ghost"
                      onClick={() => align("bottom")}
                    >
                      أسفل
                    </button>
                    <button
                      className="ds-btn ghost"
                      onClick={() =>
                        selected != null && reorder(selected, fields.length - 1)
                      }
                    >
                      إلى الأمام بالكامل
                    </button>
                    <button
                      className="ds-btn ghost"
                      onClick={() => selected != null && reorder(selected, 0)}
                    >
                      إلى الخلف بالكامل
                    </button>
                  </div>
                </div>
                <div className="de-section">
                  <h2>الخط والمظهر</h2>
                  <div className="de-fields">
                    <label className="ds-field full">
                      الخط
                      <select
                        className="ds-select"
                        value={selectedField.font_family}
                        onChange={(e) => update("font_family", e.target.value)}
                      >
                        {fonts.map((f) => (
                          <option key={f.id} value={f.family}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <N label="حجم الخط" k="font_size" />
                    <N label="الوزن" k="font_weight" step="100" />
                    <label className="ds-field">
                      اللون
                      <input
                        className="ds-input"
                        type="color"
                        value={selectedField.font_color}
                        onChange={(e) => update("font_color", e.target.value)}
                      />
                    </label>
                    <label className="ds-field">
                      المحاذاة
                      <select
                        className="ds-select"
                        value={selectedField.text_align}
                        onChange={(e) => update("text_align", e.target.value)}
                      >
                        <option value="right">يمين</option>
                        <option value="center">وسط</option>
                        <option value="left">يسار</option>
                      </select>
                    </label>
                    <label className="ds-field">
                      الاتجاه
                      <select
                        className="ds-select"
                        value={selectedField.direction}
                        onChange={(e) => update("direction", e.target.value)}
                      >
                        <option value="rtl">RTL</option>
                        <option value="ltr">LTR</option>
                        <option value="auto">تلقائي</option>
                      </select>
                    </label>
                    <N label="تباعد الأسطر" k="line_height" step="0.1" />
                    <N label="تباعد الحروف" k="letter_spacing" step="0.1" />
                    <N label="الشفافية" k="opacity" step="0.05" />
                    <N label="الدوران" k="rotation" />
                    <N label="أصغر خط" k="min_font_size" />
                    <N label="أكبر خط" k="max_font_size" />
                    <N label="أقصى حروف" k="max_length" />
                    <label className="ds-field">
                      <input
                        type="checkbox"
                        checked={selectedField.auto_fit}
                        onChange={(e) => update("auto_fit", e.target.checked)}
                      />{" "}
                      ملاءمة تلقائية
                    </label>
                    <label className="ds-field">
                      <input
                        type="checkbox"
                        checked={selectedField.is_visible}
                        onChange={(e) => update("is_visible", e.target.checked)}
                      />{" "}
                      ظاهر
                    </label>
                    <label className="ds-field">
                      <input
                        type="checkbox"
                        checked={selectedField.is_locked}
                        onChange={(e) => update("is_locked", e.target.checked)}
                      />{" "}
                      مقفل
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <div className="de-help">
                حدد طبقة من Canvas أو لوحة الطبقات لتعديل خصائصها. يمكن استخدام
                Delete للحذف، Ctrl+D للنسخ، Ctrl+Z للتراجع، والأسهم للتحريك.
              </div>
            )}
          </aside>
        </div>
      </main>
      {deletePrompt && (
        <div className="ds-modal" role="dialog" aria-modal="true">
          <div className="ds-dialog">
            <h2>حذف طبقة نص</h2>
            <p>
              {deletePrompt.usedElsewhere
                ? "هذا المتغير مستخدم في طبقة أخرى؛ سيُحذف النص المحدد فقط."
                : "هذه الطبقة تحتوي متغيرًا مستقلًا. اختر ما تريد فعله بالحقل المرتبط."}
            </p>
            <div className="ds-dialog-actions">
              <button
                className="ds-btn danger"
                onClick={() => commitRemove(deletePrompt.index, false)}
              >
                {deletePrompt.usedElsewhere
                  ? "حذف الطبقة"
                  : "حذف الحقل والطبقة"}
              </button>
              {deletePrompt.canKeep && (
                <button
                  className="ds-btn ghost"
                  onClick={() => commitRemove(deletePrompt.index, true)}
                >
                  الاحتفاظ بالحقل
                </button>
              )}
              <button
                className="ds-btn ghost"
                onClick={() => setDeletePrompt(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className="ds-toast" onClick={() => setMessage("")}>
          {message}
        </div>
      )}
    </DesignShell>
  );
  function F({
    label,
    k,
    full,
  }: {
    label: string;
    k: keyof Field;
    full?: boolean;
  }) {
    return (
      <label className={`ds-field ${full ? "full" : ""}`}>
        {label}
        <input
          className="ds-input"
          value={(selectedField as any)?.[k] ?? ""}
          onChange={(e) => update(k, e.target.value)}
        />
      </label>
    );
  }
  function N({
    label,
    k,
    step = "1",
  }: {
    label: string;
    k: keyof Field;
    step?: string;
  }) {
    return (
      <label className="ds-field">
        {label}
        <input
          className="ds-input"
          type="number"
          step={step}
          value={(selectedField as any)?.[k] ?? ""}
          onChange={(e) =>
            update(k, e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </label>
    );
  }
}
