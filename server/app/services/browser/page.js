() => {
  const LIMIT = 80;
  const clean = (value, max = 120) => (value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const visible = (el) => {
    const style = getComputedStyle(el);
    return el.getClientRects().length > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const unique = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const stableId = (el) => el.id && !/\d{4,}|:|^(react|ember|ng-|mui-|radix)/i.test(el.id) && unique(`#${CSS.escape(el.id)}`);
  const selectorOf = (el) => {
    if (stableId(el)) return `#${CSS.escape(el.id)}`;
    const tag = el.tagName.toLowerCase();
    for (const attr of ["data-testid", "data-test", "name", "aria-label"]) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const selector = `${tag}[${attr}="${CSS.escape(value)}"]`;
      if (unique(selector)) return selector;
    }
    const parts = [];
    for (let node = el; node && node !== document.body && parts.length < 10; node = node.parentElement) {
      if (stableId(node)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        return parts.join(" > ");
      }
      let index = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (sib.tagName === node.tagName) index += 1;
      }
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    }
    return ["body", ...parts].join(" > ");
  };
  const textWithoutControls = (node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll("input, select, textarea").forEach((child) => child.remove());
    return clean(copy.textContent);
  };
  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox" || type === "radio") return type;
      return "textbox";
    }
    return tag;
  };
  const nameOf = (el, role) => {
    const aria = clean(el.getAttribute("aria-label"));
    if (aria) return aria;
    const by = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");
    if (clean(by)) return clean(by);
    if (el.labels && el.labels.length && !["button", "link"].includes(role)) {
      const label = textWithoutControls(el.labels[0]);
      if (label) return label;
    }
    if (role === "button" || role === "link" || role === "tab" || role === "menuitem") {
      const text = clean(el.innerText) || clean(el.getAttribute("value")) || clean(el.querySelector("img")?.alt);
      if (text) return text;
    }
    return clean(el.getAttribute("placeholder")) || clean(el.getAttribute("title")) || clean(el.getAttribute("name"));
  };
  const formOf = (el) => {
    const form = el.form || el.closest("form");
    if (!form) return null;
    let actionPath = "";
    let actionOrigin = location.origin;
    try {
      const action = new URL(el.getAttribute("formaction") || form.getAttribute("action") || location.href, location.href);
      actionPath = action.pathname;
      actionOrigin = action.origin;
    } catch {
      actionOrigin = "";
    }
    const method = (el.getAttribute("formmethod") || form.getAttribute("method") || "get").toLowerCase();
    return { method, action_origin: actionOrigin, action_path: actionPath };
  };

  document.querySelectorAll("[data-mbuti-ref]").forEach((el) => el.removeAttribute("data-mbuti-ref"));
  // Semua tetap di tab yang sama
  document.querySelectorAll("a[target], form[target]").forEach((el) => el.removeAttribute("target"));

  let ref = 0;
  const describe = (el) => {
    ref += 1;
    el.setAttribute("data-mbuti-ref", String(ref));
    const tag = el.tagName.toLowerCase();
    const role = roleOf(el);
    const type = (el.getAttribute("type") || "").toLowerCase();
    const secret = el.getAttribute("data-mbuti-secret") || "";
    const info = { ref, tag, role, type, name: nameOf(el, role), selector: selectorOf(el), secret };
    info.autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
    if ((role === "textbox" || role === "combobox") && type !== "password" && !secret) info.value = clean(el.value, 200);
    if (role === "checkbox" || role === "radio") info.checked = Boolean(el.checked);
    if (el.disabled) info.disabled = true;
    if (tag === "select") info.options = [...el.options].slice(0, 30).map((o) => clean(o.text, 80));
    if (tag === "a") info.href = (el.getAttribute("href") || "").split("?")[0].slice(0, 200);
    info.form = formOf(el);
    return info;
  };

  const query =
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=menuitem], [role=tab], [onclick]";
  const elements = [...new Set(document.querySelectorAll(query))].filter(visible).slice(0, LIMIT).map(describe);
  const readables = [...document.querySelectorAll("h1, h2, h3, table, dl, output, ul[id], ol[id], [role=status], [role=alert]")]
    .filter((el) => visible(el) && !el.hasAttribute("data-mbuti-ref"))
    .slice(0, 20)
    .map((el) => {
      ref += 1;
      el.setAttribute("data-mbuti-ref", String(ref));
      const tag = el.tagName.toLowerCase();
      return { ref, tag, role: el.getAttribute("role") || tag, name: clean(el.innerText, 80), selector: selectorOf(el) };
    });

  const captcha = [
    ...document.querySelectorAll(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], input[name*="captcha" i], img[src*="captcha" i], [id*="captcha" i], [class*="captcha" i]'
    ),
  ].some(visible);

  return {
    url: location.origin + location.pathname,
    title: clean(document.title),
    text: (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 2500),
    elements,
    readables,
    captcha,
    password_visible: [...document.querySelectorAll("input[type=password]")].some(visible),
  };
}
