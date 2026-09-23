const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const html = fs.readFileSync("src/templates/forms.html", "utf8");
const scripts = [
  ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi),
].map((m) => m[1]);
scripts.forEach((s, i) => new vm.Script(s, { filename: `forms-script-${i}` }));
const nodes = new Map();
function node(id) {
  if (!nodes.has(id))
    nodes.set(id, {
      value: "",
      innerHTML: "",
      textContent: "",
      style: {},
      dataset: {},
      classList: {
        add() {},
        remove() {
          this.removed = true;
        },
        toggle() {},
      },
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
    });
  return nodes.get(id);
}
const writes = [];
const ctx = vm.createContext({
  console,
  URL,
  Date,
  setTimeout: () => 0,
  clearTimeout() {},
  requestAnimationFrame: () => 0,
  document: {
    getElementById: node,
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: node("html"),
    head: node("head"),
    body: node("body"),
    addEventListener() {},
    createElement: () => node("new"),
  },
  location: { replace() {} },
  fetch: async (url, options) => {
    if (options?.method === "PUT") {
      writes.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return {
      ok: true,
      json: async () =>
        url.includes("auth/me")
          ? {
              ok: true,
              user: { id: "test" },
              permissions: ["forms.manage_templates"],
            }
          : url.includes("templates=1")
            ? {
                ok: true,
                templates: [
                  {
                    template_key: "server-template",
                    name: "قالب قاعدة البيانات",
                    category: "نماذج",
                    definition: { sections: [] },
                  },
                ],
              }
            : { ok: true, documents: [], employees: [] },
    };
  },
});
ctx.window = ctx;
ctx.window.addEventListener = () => {};
(async () => {
  scripts.forEach((s) => vm.runInContext(s, ctx));
  await new Promise(setImmediate);
  assert.match(node("empGrid").innerHTML, /قالب قاعدة البيانات/);
  vm.runInContext("showAdd()", ctx);
  assert.equal(node("addMo").classList.removed, true);
  node("nfName").value = "نموذج اختبار";
  node("nfCat").value = "نماذج";
  await vm.runInContext("addCustom()", ctx);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, "نموذج اختبار");
  assert.match(node("empGrid").innerHTML, /نموذج اختبار/);
  console.log(
    "PASS: HTML scripts parse, server templates render, Add opens and saves through API.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
