const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const form = $("#listingForm");
const fields = ["marketplace", "category", "productName", "brand", "model", "productIdType", "productId", "sellerSku", "price", "stock", "bulkSkuPrefix", "bulkPrice", "bulkStock", "features", "audience"];
const state = {
  keywords: [],
  tone: "Clear",
  generated: false,
  variationsEnabled: false,
  variationTheme: "Size",
  familyMode: "new",
  parentSku: "",
  variants: [],
  selectedSizes: ["S", "M", "L", "XL"]
};
const prohibitedClaims = ["best", "#1", "number one", "guaranteed", "cure", "miracle", "cheapest", "free shipping"];
const currencySymbols = { US: "$", UK: "£", IN: "₹", CA: "C$" };
const inventoryHeaders = ["record_type", "marketplace", "category", "parent_sku", "sku", "relationship_type", "variation_theme", "size", "color", "product_id_type", "product_id", "condition_type", "price", "quantity", "brand", "product_name", "model", "title", "bullet_1", "bullet_2", "bullet_3", "bullet_4", "bullet_5", "description", "search_terms", "update_delete"];

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function sentence(value) {
  const text = clean(value).replace(/[.!]+$/, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function saveDraft() {
  const draft = Object.fromEntries(fields.map((id) => [id, $(`#${id}`).value]));
  draft.keywords = state.keywords;
  draft.tone = state.tone;
  draft.generated = state.generated;
  draft.title = $("#titleOutput").value;
  draft.description = $("#descriptionOutput").value;
  draft.bullets = getBullets();
  draft.variationsEnabled = state.variationsEnabled;
  draft.variationTheme = state.variationTheme;
  draft.familyMode = state.familyMode;
  draft.parentSku = state.parentSku;
  draft.variants = state.variants;
  draft.selectedSizes = state.selectedSizes;
  localStorage.setItem("listly-draft", JSON.stringify(draft));
  $("#saveState").textContent = "Saved locally";
}

function loadDraft() {
  const saved = localStorage.getItem("listly-draft");
  if (!saved) return;
  try {
    const draft = JSON.parse(saved);
    fields.forEach((id) => { if (draft[id] != null) $(`#${id}`).value = draft[id]; });
    state.keywords = Array.isArray(draft.keywords) ? draft.keywords : [];
    state.tone = draft.tone || "Clear";
    state.generated = Boolean(draft.generated && draft.title);
    state.variationsEnabled = Boolean(draft.variationsEnabled);
    state.variationTheme = draft.variationTheme || "Size";
    state.familyMode = draft.familyMode || "new";
    state.parentSku = draft.parentSku || "";
    state.variants = Array.isArray(draft.variants) ? draft.variants.map((variant) => ({ ...emptyVariant(), ...variant })) : [];
    state.selectedSizes = Array.isArray(draft.selectedSizes) ? draft.selectedSizes : ["S", "M", "L", "XL"];
    $$("[data-tone]").forEach((button) => button.classList.toggle("selected", button.dataset.tone === state.tone));
    renderKeywords();
    renderVariationEditor();
    if (state.generated) renderListing(draft.title, draft.bullets || [], draft.description || "");
  } catch {
    localStorage.removeItem("listly-draft");
  }
}

function addKeyword() {
  const input = $("#keywordInput");
  const keyword = clean(input.value).toLowerCase();
  if (!keyword) return;
  if (state.keywords.length >= 10) return toast("You can add up to 10 keywords");
  if (state.keywords.includes(keyword)) return toast("That keyword is already added");
  state.keywords.push(keyword);
  input.value = "";
  renderKeywords();
  saveDraft();
}

function renderKeywords() {
  $("#keywordChips").innerHTML = state.keywords.map((keyword, index) =>
    `<span class="keyword-chip">${escapeHtml(keyword)}<button type="button" data-remove-keyword="${index}" aria-label="Remove ${escapeHtml(keyword)}">×</button></span>`
  ).join("");
  $("#keywordCount").textContent = `${state.keywords.length} / 10`;
  $("#keywordNavCount").textContent = state.keywords.length;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function getFeatures() {
  return $("#features").value.split(/\n|;/).map(sentence).filter(Boolean).slice(0, 5);
}

function emptyVariant() {
  return { size: "", color: "", sku: "", productId: "", price: "", stock: "0" };
}

function productIdNeeded() {
  return $("#productIdType").value !== "GTIN_EXEMPT";
}

function variationLabel(variant) {
  if (state.variationTheme === "Size") return variant.size || "Unnamed size";
  if (state.variationTheme === "Color") return variant.color || "Unnamed color";
  return [variant.size, variant.color].filter(Boolean).join(" / ") || "Unnamed variation";
}

function variationClass() {
  if (state.variationTheme === "Size") return "size-only";
  if (state.variationTheme === "Color") return "color-only";
  return "size-color";
}

function renderVariationEditor() {
  $("#variationsEnabled").checked = state.variationsEnabled;
  $("#variationEditor").classList.toggle("hidden", !state.variationsEnabled);
  $("#variationTheme").value = state.variationTheme;
  $("#parentSku").value = state.parentSku;
  $("#parentSku").required = state.variationsEnabled;
  $("#singleOfferSection").classList.toggle("hidden", state.variationsEnabled);
  $("#productIdField").classList.toggle("hidden", state.variationsEnabled);
  ["sellerSku", "price", "stock"].forEach((id) => { $(`#${id}`).required = !state.variationsEnabled; });
  $("#singlePriceCurrency").textContent = currencySymbols[$("#marketplace").value] || "$";
  $("#exportLabel").textContent = state.variationsEnabled ? "Export variant prep CSV" : "Export prep CSV";
  $$('[data-family-mode]').forEach((button) => button.classList.toggle("selected", button.dataset.familyMode === state.familyMode));
  syncProductIdRequirements();
  renderBulkSizeBuilder();
  renderVariantRows();
  renderVariantPreview();
}

function renderBulkSizeBuilder() {
  $("#bulkSizeBuilder").classList.toggle("hidden", state.variationTheme !== "Size");
  $$("[data-size]").forEach((button) => button.classList.toggle("selected", state.selectedSizes.includes(button.dataset.size)));
  $("#selectedSizeCount").textContent = `${state.selectedSizes.length} selected`;
}

function suggestedSkuPrefix() {
  return clean(`${$("#brand").value}-${$("#productName").value}`)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

function createSelectedSizes() {
  if (state.selectedSizes.length === 0) return toast("Select at least one shirt size");
  const prefix = clean($("#bulkSkuPrefix").value) || suggestedSkuPrefix();
  const price = $("#bulkPrice").value;
  const stock = $("#bulkStock").value;
  if (!prefix) return toast("Enter a SKU prefix or product name");
  if (Number(price) <= 0) return toast("Enter the default price once");
  if (stock === "" || Number(stock) < 0) return toast("Enter a valid stock quantity");

  state.selectedSizes.forEach((size) => {
    const existing = state.variants.find((variant) => clean(variant.size).toLowerCase() === size.toLowerCase());
    if (existing) {
      if (!existing.sku) existing.sku = `${prefix}-${size}`;
      if (!existing.price) existing.price = price;
      if (existing.stock === "") existing.stock = stock;
      return;
    }
    state.variants.push({ ...emptyVariant(), size, sku: `${prefix}-${size}`, price, stock });
  });
  $("#bulkSkuPrefix").value = prefix;
  renderVariantRows();
  renderVariantPreview();
  updateOutputMetrics();
  saveDraft();
  toast(`${state.selectedSizes.length} sizes created — adjust only the exceptions`);
}

function syncProductIdRequirements() {
  const needed = productIdNeeded();
  $("#productIdRequired").classList.toggle("hidden", !needed);
  $("#productId").required = !state.variationsEnabled && needed;
  $("#productId").disabled = state.variationsEnabled || !needed;
  $("#productId").placeholder = needed ? "e.g. 012345678905" : "Not required with an approved exemption";
}

function renderVariantRows() {
  const useSize = state.variationTheme !== "Color";
  const useColor = state.variationTheme !== "Size";
  const rowClass = variationClass();
  $("#variantTableHead").className = `variant-table-head ${rowClass}`;
  $$('[data-column="size"]').forEach((item) => item.classList.toggle("column-hidden", !useSize));
  $$('[data-column="color"]').forEach((item) => item.classList.toggle("column-hidden", !useColor));
  $("#variantRows").innerHTML = state.variants.map((variant, index) => `
    <div class="variant-row ${rowClass}" data-variant-index="${index}">
      <input class="${useSize ? "" : "column-hidden"}" data-variant-field="size" value="${escapeHtml(variant.size)}" placeholder="e.g. XL" ${useSize && state.variationsEnabled ? "required" : "disabled"} aria-label="Size" />
      <input class="${useColor ? "" : "column-hidden"}" data-variant-field="color" value="${escapeHtml(variant.color)}" placeholder="e.g. Navy" ${useColor && state.variationsEnabled ? "required" : "disabled"} aria-label="Color" />
      <input data-variant-field="sku" value="${escapeHtml(variant.sku)}" placeholder="e.g. TEE-NVY-XL" ${state.variationsEnabled ? "required" : ""} aria-label="Child SKU" />
      <input data-variant-field="productId" value="${escapeHtml(variant.productId)}" placeholder="${productIdNeeded() ? "UPC / EAN" : "Exempt"}" ${state.variationsEnabled && productIdNeeded() ? "required" : "disabled"} aria-label="Product ID" />
      <div class="price-input"><span>${currencySymbols[$("#marketplace").value] || "$"}</span><input type="number" min="0.01" step="0.01" data-variant-field="price" value="${escapeHtml(String(variant.price))}" placeholder="0.00" ${state.variationsEnabled ? "required" : ""} aria-label="Price" /></div>
      <input type="number" min="0" step="1" data-variant-field="stock" value="${escapeHtml(String(variant.stock))}" ${state.variationsEnabled ? "required" : ""} aria-label="Stock quantity" />
      <button type="button" class="remove-variant" data-remove-variant="${index}" aria-label="Remove ${escapeHtml(variationLabel(variant))}">×</button>
    </div>
  `).join("");
}

function variantsAreValid() {
  if (!state.variationsEnabled) return true;
  const minimumChildren = state.familyMode === "existing" ? 1 : 2;
  if (!clean(state.parentSku) || state.variants.length < minimumChildren) return false;
  const useSize = state.variationTheme !== "Color";
  const useColor = state.variationTheme !== "Size";
  const skus = state.variants.map((variant) => clean(variant.sku).toLowerCase());
  const productIds = state.variants.map((variant) => clean(variant.productId));
  const combinations = state.variants.map((variant) => `${useSize ? clean(variant.size).toLowerCase() : ""}|${useColor ? clean(variant.color).toLowerCase() : ""}`);
  return state.variants.every((variant) =>
    (!useSize || clean(variant.size)) &&
    (!useColor || clean(variant.color)) &&
    clean(variant.sku) && (!productIdNeeded() || clean(variant.productId)) && Number(variant.price) > 0 && String(variant.stock).trim() !== "" && Number(variant.stock) >= 0
  ) && new Set(skus).size === skus.length && (!productIdNeeded() || new Set(productIds).size === productIds.length) && new Set(combinations).size === combinations.length && !skus.includes(clean(state.parentSku).toLowerCase());
}

function renderVariantPreview() {
  const show = state.generated && state.variationsEnabled;
  $("#variantOutputBlock").classList.toggle("hidden", !show);
  if (!show) return;
  $("#parentSkuPreview").textContent = state.parentSku || "Parent SKU missing";
  $("#parentPreviewNote").textContent = state.familyMode === "existing" ? "Existing parent — only new children will export" : "No price — grouping record";
  $("#variantOutputCount").textContent = `${state.variants.length} ${state.variants.length === 1 ? "child" : "children"}`;
  const currency = currencySymbols[$("#marketplace").value] || "$";
  $("#variantPreview").innerHTML = state.variants.map((variant) => `
    <div class="variant-preview-row"><strong>${escapeHtml(variationLabel(variant))}</strong><span>${escapeHtml(variant.sku || "SKU missing")} · ${escapeHtml(String(variant.stock))} in stock</span><b>${currency}${Number(variant.price || 0).toFixed(2)}</b></div>
  `).join("");
}

function createTitle() {
  const brand = clean($("#brand").value);
  const name = clean($("#productName").value);
  const model = clean($("#model").value);
  const keyword = state.keywords.find((item) => !`${brand} ${name}`.toLowerCase().includes(item));
  const firstFeature = getFeatures()[0];
  const pieces = [brand, name, model, keyword, firstFeature].filter(Boolean);
  let title = pieces.join(" — ");
  if (title.length > 200) title = title.slice(0, 197).replace(/\s+\S*$/, "") + "...";
  return title;
}

function createBullets() {
  const features = getFeatures();
  const audience = clean($("#audience").value);
  const openers = state.tone === "Premium"
    ? ["THOUGHTFUL DESIGN", "BUILT TO LAST", "REFINED DETAILS", "MADE FOR EVERY DAY", "A CONSIDERED CHOICE"]
    : state.tone === "Energetic"
      ? ["READY FOR MORE", "GO-ANYWHERE DESIGN", "EASY EVERY DAY", "POWER YOUR ROUTINE", "MADE TO MOVE"]
      : ["DESIGNED FOR DAILY USE", "RELIABLE MATERIALS", "SIMPLE TO USE", "MADE FOR YOUR ROUTINE", "A PRACTICAL CHOICE"];

  return features.map((feature, index) => {
    let body = feature;
    if (index === features.length - 1 && audience) body += `; a practical fit for ${audience}`;
    return `${openers[index]} — ${body}.`;
  });
}

function createDescription() {
  const brand = clean($("#brand").value);
  const name = clean($("#productName").value);
  const audience = clean($("#audience").value);
  const features = getFeatures();
  const intro = state.tone === "Premium"
    ? `Bring considered design to your everyday routine with the ${brand} ${name}.`
    : state.tone === "Energetic"
      ? `Get more from every day with the ${brand} ${name}, made to keep up with your routine.`
      : `The ${brand} ${name} is designed to make your everyday routine simpler.`;
  const details = features.length ? `It combines ${features.map((item) => item.toLowerCase()).join(", ")}.` : "";
  const close = audience ? `A dependable choice for ${audience}.` : `A dependable choice for home, work, or everyday use.`;
  return [intro, details, close].filter(Boolean).join(" ");
}

function renderListing(title, bullets, description) {
  $("#emptyState").classList.add("hidden");
  $("#listingOutput").classList.remove("hidden");
  $("#titleOutput").value = title;
  $("#descriptionOutput").value = description;
  $("#bulletsOutput").innerHTML = bullets.map((bullet) => `<div class="bullet-item"><span>✓</span><div contenteditable="true">${escapeHtml(bullet)}</div></div>`).join("");
  renderVariantPreview();
  updateOutputMetrics();
}

function getBullets() {
  return $$("#bulletsOutput .bullet-item div").map((item) => clean(item.textContent)).filter(Boolean);
}

function updateOutputMetrics() {
  if (!state.generated && !$("#titleOutput").value) return updateScore();
  $("#titleCount").textContent = `${$("#titleOutput").value.length} / 200`;
  $("#bulletCount").textContent = `${getBullets().length} bullets`;
  $("#descriptionCount").textContent = `${$("#descriptionOutput").value.length} characters`;
  renderChecks();
  updateScore();
}

function getCheckResults() {
  const title = $("#titleOutput").value;
  const allText = `${title} ${getBullets().join(" ")} ${$("#descriptionOutput").value}`.toLowerCase();
  const keywordMatches = state.keywords.filter((keyword) => allText.includes(keyword)).length;
  const checks = [
    { label: "Title within 200 characters", pass: title.length > 20 && title.length <= 200 },
    { label: "3–5 benefit-led bullets", pass: getBullets().length >= 3 && getBullets().length <= 5 },
    { label: state.keywords.length ? `${keywordMatches}/${state.keywords.length} keywords included` : "Add search keywords", pass: state.keywords.length > 0 && keywordMatches >= Math.ceil(state.keywords.length / 2) },
    { label: "No risky promotional claims", pass: !prohibitedClaims.some((claim) => allText.includes(claim)) }
  ];
  if (state.variationsEnabled) checks.push({ label: state.familyMode === "existing" ? "Valid existing-family update" : "Valid parent and child offers", pass: variantsAreValid() });
  return checks;
}

function renderChecks() {
  $("#checks").innerHTML = getCheckResults().map((check) =>
    `<div class="check ${check.pass ? "" : "warn"}"><i>${check.pass ? "✓" : "!"}</i>${escapeHtml(check.label)}</div>`
  ).join("");
}

function updateScore() {
  let score = 0;
  if (clean($("#productName").value)) score += 12;
  if (clean($("#brand").value)) score += 8;
  const features = getFeatures();
  score += Math.min(features.length, 5) * 5;
  if (clean($("#audience").value)) score += 5;
  score += Math.min(state.keywords.length, 5) * 4;
  if (state.generated || $("#titleOutput").value) {
    const checks = getCheckResults();
    checks.forEach((check) => { if (check.pass) score += 30 / checks.length; });
  }
  score = Math.min(100, Math.round(score));
  $("#scoreValue").textContent = score;
  $("#scoreRing").style.setProperty("--score", `${score * 3.6}deg`);
  const message = score >= 85 ? "Ready for final review" : score >= 65 ? "Strong foundation" : score >= 35 ? "Good start" : "Add product details";
  $("#scoreMessage").textContent = message;
  $("#scoreDetail").textContent = score >= 85 ? "The essentials are covered. Review accuracy before publishing." : "Complete the fields and checks to improve your score.";
}

function generateListing(event) {
  event?.preventDefault();
  const minimumChildren = state.familyMode === "existing" ? 1 : 2;
  if (state.variationsEnabled && state.variants.length < minimumChildren) {
    toast(state.familyMode === "existing" ? "Add the new child size" : "Add at least two child sizes for a new family");
    return;
  }
  if (!form.reportValidity()) return;
  state.generated = true;
  renderListing(createTitle(), createBullets(), createDescription());
  saveDraft();
  toast("Listing generated — you can edit every section");
  if (window.innerWidth < 1050) $("#listingOutput").scrollIntoView({ behavior: "smooth", block: "start" });
}

function listingText() {
  const variations = state.variationsEnabled
    ? `\n\nVARIATION FAMILY\nParent SKU: ${state.parentSku}\nTheme: ${state.variationTheme}\n${state.variants.map((variant) => `• ${variationLabel(variant)} | ${variant.sku} | ${currencySymbols[$("#marketplace").value] || "$"}${Number(variant.price).toFixed(2)} | Stock: ${variant.stock}`).join("\n")}`
    : "";
  return `TITLE\n${$("#titleOutput").value}\n\nKEY FEATURES\n${getBullets().map((item) => `• ${item}`).join("\n")}\n\nDESCRIPTION\n${$("#descriptionOutput").value}${variations}`;
}

async function copyText(text, message = "Copied to clipboard") {
  if (!text) return toast("Generate a listing first");
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    toast(message);
  }
}

function exportListing() {
  if (!state.generated) return toast("Generate a listing first");
  if (!form.reportValidity()) return;
  if (state.variationsEnabled && !variantsAreValid()) return toast("Complete the variation family before exporting");
  const blob = new Blob(["\uFEFF", inventoryCsv()], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${clean($("#productName").value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "amazon-listing"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Amazon preparation CSV exported");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function inventoryCsv() {
  const rows = inventoryRecords().map((record) => inventoryHeaders.map((header) => record[header] ?? ""));
  return [inventoryHeaders, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function inventoryRecords() {
  const bullets = getBullets();
  const shared = {
    marketplace: $("#marketplace").value,
    category: $("#category").value,
    brand: $("#brand").value,
    product_name: $("#productName").value,
    model: $("#model").value,
    title: $("#titleOutput").value,
    description: $("#descriptionOutput").value,
    search_terms: state.keywords.join(" "),
    update_delete: "Update"
  };
  Array.from({ length: 5 }, (_, index) => { shared[`bullet_${index + 1}`] = bullets[index] || ""; });
  const offer = ({ recordType, parentSku = "", sku, relationship = "", theme = "", size = "", color = "", productId = "", price = "", quantity = "" }) => ({
    ...shared,
    record_type: recordType,
    parent_sku: parentSku,
    sku,
    relationship_type: relationship,
    variation_theme: theme,
    size,
    color,
    product_id_type: recordType === "parent" ? "" : $("#productIdType").value,
    product_id: productId,
    condition_type: recordType === "parent" ? "" : "new",
    price,
    quantity
  });
  const childRows = state.variants.map((variant) => offer({
    recordType: "child",
    parentSku: state.parentSku,
    sku: variant.sku,
    relationship: "variation",
    theme: state.variationTheme,
    size: state.variationTheme === "Color" ? "" : variant.size,
    color: state.variationTheme === "Size" ? "" : variant.color,
    productId: productIdNeeded() ? variant.productId : "",
    price: Number(variant.price).toFixed(2),
    quantity: variant.stock
  }));
  if (state.variationsEnabled) {
    if (state.familyMode === "existing") return childRows;
    return [offer({ recordType: "parent", sku: state.parentSku, theme: state.variationTheme }), ...childRows];
  }
  return [offer({
    recordType: "standalone",
    sku: $("#sellerSku").value,
    productId: productIdNeeded() ? $("#productId").value : "",
    price: Number($("#price").value).toFixed(2),
    quantity: $("#stock").value
  })];
}

const amazonHeaderAliases = {
  record_type: ["parent_child", "parentage", "parentage_level", "parent_child_relationship"],
  marketplace: ["marketplace", "marketplace_id", "marketplace_name"],
  category: ["category", "category_name"],
  parent_sku: ["parent_sku", "parentage_parent_sku"],
  sku: ["item_sku", "seller_sku", "sku"],
  relationship_type: ["relationship_type", "relationship"],
  variation_theme: ["variation_theme", "variation_theme_name"],
  size: ["size_name", "size", "apparel_size", "apparel_size_name"],
  color: ["color_name", "colour_name", "color", "colour"],
  product_id_type: ["external_product_id_type", "product_id_type", "product_id_type_name"],
  product_id: ["external_product_id", "product_id", "standard_product_id", "externally_assigned_product_identifier"],
  condition_type: ["condition_type", "condition"],
  price: ["standard_price", "our_price", "price"],
  quantity: ["quantity", "inventory", "stock"],
  brand: ["brand_name", "brand"],
  product_name: ["product_name"],
  model: ["model_name", "model_number", "model"],
  title: ["item_name", "product_title", "title"],
  bullet_1: ["bullet_point1", "bullet_point_1", "key_product_features1"],
  bullet_2: ["bullet_point2", "bullet_point_2", "key_product_features2"],
  bullet_3: ["bullet_point3", "bullet_point_3", "key_product_features3"],
  bullet_4: ["bullet_point4", "bullet_point_4", "key_product_features4"],
  bullet_5: ["bullet_point5", "bullet_point_5", "key_product_features5"],
  description: ["product_description", "description"],
  search_terms: ["generic_keywords", "search_terms", "search_terms1"],
  update_delete: ["update_delete", "update_action", "action"]
};

const amazonAliasLookup = new Map(Object.entries(amazonHeaderAliases).flatMap(([field, aliases]) => aliases.map((alias) => [alias, field])));
let selectedAmazonTemplate = null;

function cellText(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  if (value.text != null) return String(value.text);
  if (value.result != null) return String(value.result);
  return "";
}

function normalizeHeader(value) {
  return cellText(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function canonicalFieldForHeader(value) {
  const header = normalizeHeader(value);
  if (amazonAliasLookup.has(header)) return amazonAliasLookup.get(header);
  const simplified = header.replace(/_\d+_value$/, "").replace(/_value$/, "");
  if (amazonAliasLookup.has(simplified)) return amazonAliasLookup.get(simplified);
  if (/externally_assigned_product_identifier_\d+_type$/.test(header)) return "product_id_type";
  if (/externally_assigned_product_identifier_\d+_value$/.test(header)) return "product_id";
  const bulletMatch = header.match(/(?:bullet_point|key_product_features)_?(\d)(?:_value)?$/);
  if (bulletMatch && Number(bulletMatch[1]) <= 5) return `bullet_${bulletMatch[1]}`;
  return null;
}

function requiredTemplateFields() {
  const required = ["sku", "title"];
  if (!state.variationsEnabled) {
    required.push("price");
    if (productIdNeeded()) required.push("product_id", "product_id_type");
    return required;
  }
  required.push("parent_sku", "relationship_type", "variation_theme");
  if (state.familyMode === "new") required.push("record_type");
  if (state.variationTheme !== "Color") required.push("size");
  if (state.variationTheme !== "Size") required.push("color");
  if (productIdNeeded()) required.push("product_id", "product_id_type");
  return required;
}

function chooseTemplateOption(candidates, options) {
  if (!options.length) return candidates[0];
  const match = options.find((option) => candidates.some((candidate) => normalizeHeader(candidate) === normalizeHeader(option)));
  return match || candidates[0];
}

function amazonTemplateValue(field, record, options = []) {
  if (field === "record_type") return record.record_type === "standalone" ? "" : record.record_type;
  if (field === "variation_theme" && record.variation_theme) {
    const themes = { Size: ["SizeName", "Size"], Color: ["ColorName", "Color"], SizeColor: ["SizeName-ColorName", "SizeColor", "Size-Color"] };
    return chooseTemplateOption(themes[record.variation_theme] || [record.variation_theme], options);
  }
  if (field === "condition_type" && record.condition_type) return chooseTemplateOption(["new_new", "new", "New"], options);
  if (field === "product_id_type" && record.product_id_type) return chooseTemplateOption([record.product_id_type, record.product_id_type.toLowerCase()], options);
  if (field === "relationship_type" && record.relationship_type) return chooseTemplateOption(["variation", "Variation"], options);
  if (field === "update_delete") return chooseTemplateOption(["Update", "PartialUpdate", "update"], options);
  return record[field] ?? "";
}

function readUint16(view, offset) { return view.getUint16(offset, true); }
function readUint32(view, offset) { return view.getUint32(offset, true); }

function writeUint16(bytes, offset, value) { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true); }
function writeUint32(bytes, offset, value) { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value >>> 0, true); }

function concatBytes(chunks) {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
  return output;
}

function parseZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error("This file is not a valid .xlsx workbook");
  const entryCount = readUint16(view, end + 10);
  let offset = readUint32(view, end + 16);
  const decoder = new TextDecoder();
  const entries = [];
  let totalSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) throw new Error("The workbook ZIP directory is damaged");
    const flags = readUint16(view, offset + 8);
    const method = readUint16(view, offset + 10);
    const time = readUint16(view, offset + 12);
    const date = readUint16(view, offset + 14);
    const crc = readUint32(view, offset + 16);
    const compressedSize = readUint32(view, offset + 20);
    const size = readUint32(view, offset + 24);
    totalSize += size;
    if (flags & 0x01) throw new Error("Password-protected workbooks are not supported");
    if (size > 100 * 1024 * 1024 || totalSize > 250 * 1024 * 1024) throw new Error("This workbook is too large to process safely");
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const internalAttributes = readUint16(view, offset + 36);
    const externalAttributes = readUint32(view, offset + 38);
    const localOffset = readUint32(view, offset + 42);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    if (readUint32(view, localOffset) !== 0x04034b50) throw new Error("The workbook contains an invalid ZIP entry");
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name, nameBytes, flags, method, time, date, crc, compressedSize, size, internalAttributes, externalAttributes, compressedData: bytes.slice(dataOffset, dataOffset + compressedSize) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateZipEntry(entry) {
  if (entry.method === 0) return entry.compressedData;
  if (entry.method !== 8 || typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress the Amazon workbook");
  const stream = new Blob([entry.compressedData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipText(entries, name) {
  const entry = entries.find((item) => item.name === name);
  if (!entry) throw new Error(`Workbook part not found: ${name}`);
  return new TextDecoder().decode(await inflateZipEntry(entry));
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, value) => {
      let current = value;
      for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
      return current >>> 0;
    });
  }
  let crc = 0xffffffff;
  bytes.forEach((byte) => { crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries, replacements) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  entries.forEach((entry) => {
    const replacement = replacements.get(entry.name);
    const data = replacement || entry.compressedData;
    const method = replacement ? 0 : entry.method;
    const size = replacement ? replacement.length : entry.size;
    const compressedSize = data.length;
    const crc = replacement ? crc32(replacement) : entry.crc;
    const flags = entry.flags & ~0x08;
    const local = new Uint8Array(30 + entry.nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, flags);
    writeUint16(local, 8, method);
    writeUint16(local, 10, entry.time);
    writeUint16(local, 12, entry.date);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, compressedSize);
    writeUint32(local, 22, size);
    writeUint16(local, 26, entry.nameBytes.length);
    local.set(entry.nameBytes, 30);
    localChunks.push(local, data);

    const central = new Uint8Array(46 + entry.nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, flags);
    writeUint16(central, 10, method);
    writeUint16(central, 12, entry.time);
    writeUint16(central, 14, entry.date);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, compressedSize);
    writeUint32(central, 24, size);
    writeUint16(central, 28, entry.nameBytes.length);
    writeUint16(central, 36, entry.internalAttributes);
    writeUint32(central, 38, entry.externalAttributes);
    writeUint32(central, 42, localOffset);
    central.set(entry.nameBytes, 46);
    centralChunks.push(central);
    localOffset += local.length + data.length;
  });
  const centralDirectory = concatBytes(centralChunks);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, localOffset);
  return concatBytes([...localChunks, centralDirectory, end]);
}

function parseXml(xml, label) {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.getElementsByTagName("parsererror").length) throw new Error(`Could not read ${label} XML`);
  return documentNode;
}

function elementsByLocalName(node, name) {
  return [...node.getElementsByTagNameNS("*", name)];
}

function resolveZipPath(base, target) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const parts = `${base.substring(0, base.lastIndexOf("/") + 1)}${target}`.split("/");
  const resolved = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  });
  return resolved.join("/");
}

function worksheetCellText(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return elementsByLocalName(cell, "t").map((node) => node.textContent || "").join("");
  const value = elementsByLocalName(cell, "v")[0]?.textContent || "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  return value;
}

function columnNumberFromReference(reference) {
  const letters = (reference.match(/^[A-Z]+/i) || [""])[0].toUpperCase();
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function columnLetters(column) {
  let value = column;
  let result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

function rowMap(documentNode) {
  return new Map(elementsByLocalName(documentNode, "row").map((row) => [Number(row.getAttribute("r")), row]));
}

function findCell(row, column) {
  return elementsByLocalName(row, "c").find((cell) => columnNumberFromReference(cell.getAttribute("r")) === column);
}

async function readAmazonPackage(arrayBuffer) {
  const entries = parseZip(arrayBuffer);
  const workbookDocument = parseXml(await readZipText(entries, "xl/workbook.xml"), "workbook");
  const relationshipsDocument = parseXml(await readZipText(entries, "xl/_rels/workbook.xml.rels"), "workbook relationships");
  const relationshipTargets = new Map(elementsByLocalName(relationshipsDocument, "Relationship").map((relationship) => [relationship.getAttribute("Id"), relationship.getAttribute("Target")]));
  let sharedStrings = [];
  if (entries.some((entry) => entry.name === "xl/sharedStrings.xml")) {
    const sharedDocument = parseXml(await readZipText(entries, "xl/sharedStrings.xml"), "shared strings");
    sharedStrings = elementsByLocalName(sharedDocument, "si").map((item) => elementsByLocalName(item, "t").map((textNode) => textNode.textContent || "").join(""));
  }
  const sheets = [];
  for (const sheet of elementsByLocalName(workbookDocument, "sheet")) {
    const relationId = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relationshipTargets.get(relationId);
    if (!target) continue;
    const path = resolveZipPath("xl/workbook.xml", target);
    if (!entries.some((entry) => entry.name === path)) continue;
    sheets.push({ name: sheet.getAttribute("name"), path, document: parseXml(await readZipText(entries, path), sheet.getAttribute("name")) });
  }
  return { entries, sheets, sharedStrings };
}

function analyzeAmazonPackage(packageData) {
  let best = null;
  packageData.sheets.forEach((sheet) => {
    const rows = rowMap(sheet.document);
    for (let rowNumber = 1; rowNumber <= 30; rowNumber += 1) {
      const row = rows.get(rowNumber);
      if (!row) continue;
      const mappings = elementsByLocalName(row, "c").map((cell) => {
        const header = worksheetCellText(cell, packageData.sharedStrings);
        return { column: columnNumberFromReference(cell.getAttribute("r")), field: canonicalFieldForHeader(header), header };
      }).filter((mapping) => mapping.field);
      const uniqueFields = new Set(mappings.map((mapping) => mapping.field));
      const score = uniqueFields.size + (/template|upload|inventory/i.test(sheet.name) ? 1 : 0);
      if (!best || score > best.score || (score === best.score && rowNumber > best.headerRow)) best = { sheet, rows, headerRow: rowNumber, mappings, uniqueFields, score };
    }
  });
  if (!best || best.uniqueFields.size < 3) throw new Error("Could not find Amazon listing headers in this workbook");
  const skuMapping = best.mappings.find((mapping) => mapping.field === "sku");
  best.dataRow = best.headerRow + 1;
  if (skuMapping) {
    for (let rowNumber = best.headerRow + 1; rowNumber <= best.headerRow + 10; rowNumber += 1) {
      const row = best.rows.get(rowNumber);
      const skuCell = row ? findCell(row, skuMapping.column) : null;
      if (!skuCell || !worksheetCellText(skuCell, packageData.sharedStrings).trim()) { best.dataRow = rowNumber; break; }
    }
  }
  best.missingCritical = requiredTemplateFields().filter((field) => !best.uniqueFields.has(field));
  return best;
}

function insertRowInOrder(sheetData, row) {
  const rowNumber = Number(row.getAttribute("r"));
  const next = [...sheetData.children].find((candidate) => candidate.localName === "row" && Number(candidate.getAttribute("r")) > rowNumber);
  sheetData.insertBefore(row, next || null);
}

function updateRowReferences(row, rowNumber) {
  row.setAttribute("r", rowNumber);
  elementsByLocalName(row, "c").forEach((cell) => {
    const column = (cell.getAttribute("r").match(/^[A-Z]+/i) || [""])[0];
    cell.setAttribute("r", `${column}${rowNumber}`);
  });
}

function setWorksheetCell(documentNode, row, rowNumber, column, value, numeric) {
  const namespace = documentNode.documentElement.namespaceURI;
  let cell = findCell(row, column);
  if (!cell) {
    cell = documentNode.createElementNS(namespace, "c");
    cell.setAttribute("r", `${columnLetters(column)}${rowNumber}`);
    const next = elementsByLocalName(row, "c").find((candidate) => columnNumberFromReference(candidate.getAttribute("r")) > column);
    row.insertBefore(cell, next || null);
  }
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  if (value === "" || value == null) { cell.removeAttribute("t"); return; }
  if (numeric && Number.isFinite(Number(value))) {
    cell.removeAttribute("t");
    const valueNode = documentNode.createElementNS(namespace, "v");
    valueNode.textContent = String(value);
    cell.appendChild(valueNode);
    return;
  }
  cell.setAttribute("t", "inlineStr");
  const inline = documentNode.createElementNS(namespace, "is");
  const textNode = documentNode.createElementNS(namespace, "t");
  textNode.setAttribute("xml:space", "preserve");
  textNode.textContent = String(value);
  inline.appendChild(textNode);
  cell.appendChild(inline);
}

function referenceInRange(reference, range) {
  const parse = (value) => {
    const match = value.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/i);
    return match ? { column: columnNumberFromReference(match[1]), row: Number(match[2]) } : null;
  };
  const [startText, endText = startText] = range.split(":");
  const point = parse(reference);
  const start = parse(startText);
  const end = parse(endText);
  return Boolean(point && start && end && point.column >= start.column && point.column <= end.column && point.row >= start.row && point.row <= end.row);
}

function worksheetValidationOptions(documentNode, rowNumber, column) {
  const reference = `${columnLetters(column)}${rowNumber}`;
  const validation = elementsByLocalName(documentNode, "dataValidation").find((item) =>
    (item.getAttribute("sqref") || "").split(/\s+/).some((range) => referenceInRange(reference, range))
  );
  if (!validation) return [];
  const formula = elementsByLocalName(validation, "formula1")[0]?.textContent?.trim() || "";
  const direct = formula.replace(/^"|"$/g, "");
  return direct.includes(",") && !direct.includes("!") ? direct.split(",").map((value) => value.trim()).filter(Boolean) : [];
}

function updateWorksheetDimension(documentNode, lastRow, lastColumn) {
  const dimension = elementsByLocalName(documentNode, "dimension")[0];
  if (!dimension) return;
  const current = dimension.getAttribute("ref") || "A1";
  const [start = "A1", end = start] = current.split(":");
  const currentEndColumn = columnNumberFromReference(end);
  const currentEndRow = Number((end.match(/\d+$/) || ["1"])[0]);
  dimension.setAttribute("ref", `${start}:${columnLetters(Math.max(currentEndColumn, lastColumn))}${Math.max(currentEndRow, lastRow)}`);
}

function fillAmazonPackage(packageData, analysis) {
  const records = inventoryRecords();
  const documentNode = analysis.sheet.document;
  const sheetData = elementsByLocalName(documentNode, "sheetData")[0];
  if (!sheetData) throw new Error("Amazon template sheet has no data area");
  let templateRow = analysis.rows.get(analysis.dataRow);
  if (!templateRow) {
    templateRow = documentNode.createElementNS(documentNode.documentElement.namespaceURI, "row");
    templateRow.setAttribute("r", analysis.dataRow);
    insertRowInOrder(sheetData, templateRow);
  }
  const prototype = templateRow.cloneNode(true);
  records.forEach((record, index) => {
    const rowNumber = analysis.dataRow + index;
    let row = rowMap(documentNode).get(rowNumber);
    if (!row) {
      row = prototype.cloneNode(true);
      updateRowReferences(row, rowNumber);
      insertRowInOrder(sheetData, row);
    }
    analysis.mappings.forEach((mapping) => {
      const options = worksheetValidationOptions(documentNode, rowNumber, mapping.column);
      const value = amazonTemplateValue(mapping.field, record, options);
      setWorksheetCell(documentNode, row, rowNumber, mapping.column, value, mapping.field === "price" || mapping.field === "quantity");
    });
  });
  updateWorksheetDimension(documentNode, analysis.dataRow + records.length - 1, Math.max(...analysis.mappings.map((mapping) => mapping.column)));
  return records.length;
}

function refreshTemplateRequirements() {
  if (!selectedAmazonTemplate) return;
  selectedAmazonTemplate.analysis.missingCritical = requiredTemplateFields().filter((field) => !selectedAmazonTemplate.analysis.uniqueFields.has(field));
  renderTemplateAnalysis(selectedAmazonTemplate.analysis);
}

function resetTemplateTool() {
  selectedAmazonTemplate = null;
  $("#amazonTemplateFile").value = "";
  $("#templateFileName").textContent = "Choose Amazon template";
  $("#templateStatus").className = "template-status";
  $("#templateStatus").textContent = "No Amazon template selected";
  $("#mappingReport").classList.add("hidden");
  $("#fillTemplateBtn").disabled = true;
}

function renderTemplateAnalysis(analysis) {
  const missing = analysis.missingCritical;
  const mapped = [...analysis.uniqueFields].length;
  $("#mappingReport").classList.remove("hidden");
  $("#mappingReport").innerHTML = `
    <strong>${escapeHtml(analysis.sheet.name)}</strong> · header row ${analysis.headerRow}<br />
    ${mapped} listing fields matched.${missing.length ? `<br /><span class="mapping-warning">Missing critical columns: ${missing.map(escapeHtml).join(", ")}</span>` : " Critical columns are mapped."}<br />
    Amazon may still require category-specific attributes that are not part of the listing assistant; review Seller Central’s processing report after upload.
  `;
  $("#fillTemplateBtn").disabled = missing.length > 0;
  $("#templateStatus").className = `template-status ${missing.length ? "error" : "success"}`;
  $("#templateStatus").textContent = missing.length ? "Template recognized, but critical columns are missing" : "Template recognized and ready to fill";
}

async function loadAmazonTemplate(file) {
  selectedAmazonTemplate = null;
  $("#fillTemplateBtn").disabled = true;
  $("#mappingReport").classList.add("hidden");
  $("#templateFileName").textContent = file?.name || "Choose Amazon template";
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    $("#templateStatus").className = "template-status error";
    $("#templateStatus").textContent = "Choose an Amazon template smaller than 50 MB";
    return;
  }
  $("#templateStatus").className = "template-status";
  $("#templateStatus").textContent = "Reading Amazon template…";
  try {
    const packageData = await readAmazonPackage(await file.arrayBuffer());
    const analysis = analyzeAmazonPackage(packageData);
    selectedAmazonTemplate = { file, analysis };
    renderTemplateAnalysis(analysis);
  } catch (error) {
    $("#templateStatus").className = "template-status error";
    $("#templateStatus").textContent = error.message || "Could not read this workbook";
  }
}

async function downloadFilledAmazonTemplate() {
  if (!selectedAmazonTemplate) return toast("Choose Amazon’s blank template first");
  if (!state.generated || !form.reportValidity()) return toast("Complete and generate the listing first");
  if (state.variationsEnabled && !variantsAreValid()) return toast("Complete the variation rows first");
  const button = $("#fillTemplateBtn");
  button.disabled = true;
  button.textContent = "Building workbook…";
  try {
    const packageData = await readAmazonPackage(await selectedAmazonTemplate.file.arrayBuffer());
    const analysis = analyzeAmazonPackage(packageData);
    if (analysis.missingCritical.length) throw new Error(`Missing critical columns: ${analysis.missingCritical.join(", ")}`);
    const rowCount = fillAmazonPackage(packageData, analysis);
    const worksheetXml = new TextEncoder().encode(new XMLSerializer().serializeToString(analysis.sheet.document));
    const workbookBytes = buildZip(packageData.entries, new Map([[analysis.sheet.path, worksheetXml]]));
    const blob = new Blob([workbookBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = selectedAmazonTemplate.file.name.replace(/\.xlsx$/i, "") + "-filled.xlsx";
    link.click();
    URL.revokeObjectURL(link.href);
    $("#templateStatus").className = "template-status success";
    $("#templateStatus").textContent = `${rowCount} listing ${rowCount === 1 ? "row" : "rows"} added to Amazon’s workbook`;
    toast("Amazon upload workbook created");
  } catch (error) {
    $("#templateStatus").className = "template-status error";
    $("#templateStatus").textContent = error.message || "Could not create the workbook";
  } finally {
    button.disabled = Boolean(selectedAmazonTemplate?.analysis.missingCritical.length);
    button.textContent = "Fill and download Amazon workbook";
  }
}

function resetDraft() {
  if (!confirm("Start a new draft? This clears the current listing.")) return;
  form.reset();
  state.keywords = [];
  state.tone = "Clear";
  state.generated = false;
  state.variationsEnabled = false;
  state.variationTheme = "Size";
  state.familyMode = "new";
  state.parentSku = "";
  state.variants = [];
  state.selectedSizes = ["S", "M", "L", "XL"];
  $$("[data-tone]").forEach((button) => button.classList.toggle("selected", button.dataset.tone === "Clear"));
  renderKeywords();
  renderVariationEditor();
  $("#emptyState").classList.remove("hidden");
  $("#listingOutput").classList.add("hidden");
  $("#titleOutput").value = "";
  $("#descriptionOutput").value = "";
  $("#bulletsOutput").innerHTML = "";
  resetTemplateTool();
  localStorage.removeItem("listly-draft");
  updateScore();
  toast("New draft started");
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2200);
}

const tutorialSteps = [
  {
    target: null,
    title: "Start with Amazon's blank template",
    body: "In Seller Central, open Catalog > Add Products > Spreadsheet and download the template for the correct marketplace, category, and product type."
  },
  {
    target: "#marketplace",
    title: "Choose the marketplace and category",
    body: "Start here so the draft reflects where and what you sell. The category selector is beside the marketplace."
  },
  {
    target: "#productName",
    title: "Enter the core product details",
    body: "Add the product name, then complete the brand, model, product identifier, SKU, price, and stock fields below it."
  },
  {
    target: ".variation-section",
    title: "Turn on variations when needed",
    body: "Use this switch for size or color families. Listly will guide you through the parent SKU and buyable child rows."
  },
  {
    target: "#features",
    title: "Write one benefit per line",
    body: "Add three to five accurate product features. These become the benefit-led bullet points in the generated listing."
  },
  {
    target: "#keywords",
    title: "Add shopper search terms",
    body: "Type a keyword and press Enter. Add the phrases customers are most likely to use for this product."
  },
  {
    target: ".generate-btn",
    title: "Generate the listing",
    body: "Select this button after the required fields are complete. You can edit every generated section before export."
  },
  {
    target: ".output-panel",
    title: "Review the listing and checks",
    body: "Read the title, bullets, description, score, claims, and variation rows. Correct anything inaccurate before continuing."
  },
  {
    target: function () { return state.generated ? "#templateDrop" : ".output-panel"; },
    title: "Choose Amazon's blank .xlsx",
    body: "After generating the listing, choose the untouched workbook downloaded from Seller Central. Listly will detect its listing headers."
  },
  {
    target: function () { return selectedAmazonTemplate ? "#fillTemplateBtn" : (state.generated ? "#templateDrop" : ".output-panel"); },
    title: "Check the mapping, then download",
    body: "Confirm the detected sheet, header row, matched fields, and critical columns. Then fill and download the workbook ending in -filled.xlsx."
  },
  {
    target: null,
    title: "Finish in Seller Central",
    body: "Return to the Spreadsheet page, upload the -filled.xlsx file, and resolve every category-specific item in Amazon's processing report."
  }
];

let tutorialStepIndex = 0;
let tutorialPositionTimer;
let tutorialPositionFrame;
let tutorialPreviousFocus;

function tutorialTargetForStep(step) {
  const selector = typeof step.target === "function" ? step.target() : step.target;
  if (!selector) return null;
  const target = $(selector);
  return target?.getClientRects().length ? target : $(".output-panel");
}

function positionTutorialCue() {
  const tour = $("#tutorialTour");
  if (tour.hidden) return;
  const step = tutorialSteps[tutorialStepIndex];
  const target = tutorialTargetForStep(step);
  const highlight = $("#tutorialHighlight");
  const cue = $("#tutorialCue");
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const edge = 12;

  if (!target) {
    highlight.classList.add("centered");
    Object.assign(highlight.style, {
      left: (viewportWidth / 2) + "px",
      top: (viewportHeight / 2) + "px",
      width: "0px",
      height: "0px"
    });
    cue.style.left = Math.max(edge, (viewportWidth - cue.offsetWidth) / 2) + "px";
    cue.style.top = Math.max(edge, (viewportHeight - cue.offsetHeight) / 2) + "px";
    return;
  }

  highlight.classList.remove("centered");
  const rect = target.getBoundingClientRect();
  const highlightTop = Math.max(7, rect.top - 7);
  const highlightLeft = Math.max(7, rect.left - 7);
  const highlightRight = Math.min(viewportWidth - 7, rect.right + 7);
  const highlightBottom = Math.min(viewportHeight - 7, rect.bottom + 7);
  Object.assign(highlight.style, {
    left: highlightLeft + "px",
    top: highlightTop + "px",
    width: Math.max(34, highlightRight - highlightLeft) + "px",
    height: Math.max(34, highlightBottom - highlightTop) + "px"
  });

  const cueWidth = cue.offsetWidth;
  const cueHeight = cue.offsetHeight;
  let cueLeft = Math.min(Math.max(edge, rect.left), viewportWidth - cueWidth - edge);
  const below = rect.bottom + 16;
  const above = rect.top - cueHeight - 16;
  let cueTop = below + cueHeight <= viewportHeight - edge ? below : above;
  cueTop = Math.min(Math.max(edge, cueTop), viewportHeight - cueHeight - edge);

  if (rect.width > cueWidth + 40 && cueTop < rect.bottom && cueTop + cueHeight > rect.top) {
    cueLeft = Math.min(viewportWidth - cueWidth - edge, rect.right - cueWidth - 12);
  }

  cue.style.left = cueLeft + "px";
  cue.style.top = cueTop + "px";
}

function scheduleTutorialPosition() {
  if ($("#tutorialTour").hidden) return;
  cancelAnimationFrame(tutorialPositionFrame);
  tutorialPositionFrame = requestAnimationFrame(positionTutorialCue);
}

function renderTutorialStep(index, scroll = true) {
  tutorialStepIndex = Math.min(Math.max(index, 0), tutorialSteps.length - 1);
  const step = tutorialSteps[tutorialStepIndex];
  $("#tutorialProgress").textContent = "STEP " + (tutorialStepIndex + 1) + " OF " + tutorialSteps.length;
  $("#tutorialCueTitle").textContent = step.title;
  $("#tutorialCueBody").textContent = step.body;
  $("#tutorialCue > small").textContent = step.target
    ? "Click the highlighted area when you are ready, then use Next."
    : "Use Next to continue. Your current draft will not be changed.";
  $("#tutorialPrevBtn").disabled = tutorialStepIndex === 0;
  $("#tutorialNextBtn").textContent = tutorialStepIndex === tutorialSteps.length - 1 ? "Finish" : "Next";

  const target = tutorialTargetForStep(step);
  clearTimeout(tutorialPositionTimer);
  if (target && scroll) {
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    tutorialPositionTimer = setTimeout(positionTutorialCue, 380);
  } else {
    positionTutorialCue();
  }
}

function openTutorial() {
  tutorialPreviousFocus = document.activeElement;
  $(".sidebar").classList.remove("open");
  $("#tutorialTour").hidden = false;
  renderTutorialStep(0, false);
  $("#tutorialCue").focus({ preventScroll: true });
}

function closeTutorial() {
  clearTimeout(tutorialPositionTimer);
  $("#tutorialTour").hidden = true;
  (tutorialPreviousFocus || $("#tutorialBtn")).focus?.({ preventScroll: true });
}

function moveTutorial(direction) {
  const next = tutorialStepIndex + direction;
  if (next >= tutorialSteps.length) return closeTutorial();
  renderTutorialStep(next);
}

$("#tutorialBtn").addEventListener("click", openTutorial);
$("#tutorialClose").addEventListener("click", closeTutorial);
$("#tutorialPrevBtn").addEventListener("click", () => moveTutorial(-1));
$("#tutorialNextBtn").addEventListener("click", () => moveTutorial(1));
window.addEventListener("resize", scheduleTutorialPosition);
window.addEventListener("scroll", scheduleTutorialPosition, { passive: true });
document.addEventListener("keydown", (event) => {
  if ($("#tutorialTour").hidden) return;
  if (event.key === "Escape") { event.preventDefault(); closeTutorial(); }
  if (event.key === "ArrowRight") { event.preventDefault(); moveTutorial(1); }
  if (event.key === "ArrowLeft") { event.preventDefault(); moveTutorial(-1); }
});

form.addEventListener("submit", generateListing);
$("#addKeywordBtn").addEventListener("click", addKeyword);
$("#keywordInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); addKeyword(); }
});
$("#keywordChips").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-keyword]");
  if (!button) return;
  state.keywords.splice(Number(button.dataset.removeKeyword), 1);
  renderKeywords();
  updateScore();
  saveDraft();
});
$("#toneControl").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tone]");
  if (!button) return;
  state.tone = button.dataset.tone;
  $$("[data-tone]").forEach((item) => item.classList.toggle("selected", item === button));
  saveDraft();
});
$("#variationsEnabled").addEventListener("change", (event) => {
  state.variationsEnabled = event.target.checked;
  if (state.variationsEnabled && !$("#bulkSkuPrefix").value) $("#bulkSkuPrefix").value = suggestedSkuPrefix();
  renderVariationEditor();
  updateOutputMetrics();
  refreshTemplateRequirements();
  saveDraft();
});
$("#variationTheme").addEventListener("change", (event) => {
  state.variationTheme = event.target.value;
  renderBulkSizeBuilder();
  renderVariantRows();
  renderVariantPreview();
  updateOutputMetrics();
  refreshTemplateRequirements();
  saveDraft();
});
$("#familyModeControl").addEventListener("click", (event) => {
  const button = event.target.closest("[data-family-mode]");
  if (!button || button.dataset.familyMode === state.familyMode) return;
  if (state.variants.length && !confirm("Switching workflows clears the current variation rows. Continue?")) return;
  state.familyMode = button.dataset.familyMode;
  state.variants = [];
  state.selectedSizes = state.familyMode === "new" ? ["S", "M", "L", "XL"] : [];
  renderVariationEditor();
  updateOutputMetrics();
  refreshTemplateRequirements();
  saveDraft();
});
$("#sizePresets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-size]");
  if (!button) return;
  const size = button.dataset.size;
  state.selectedSizes = state.selectedSizes.includes(size)
    ? state.selectedSizes.filter((item) => item !== size)
    : [...state.selectedSizes, size];
  renderBulkSizeBuilder();
  saveDraft();
});
$("#createSizesBtn").addEventListener("click", createSelectedSizes);
$("#bulkSizeBuilder").addEventListener("input", () => {
  clearTimeout(form.saveTimer);
  form.saveTimer = setTimeout(saveDraft, 450);
});
$("#productIdType").addEventListener("change", () => {
  syncProductIdRequirements();
  renderVariantRows();
  updateOutputMetrics();
  refreshTemplateRequirements();
  saveDraft();
});
$("#parentSku").addEventListener("input", (event) => {
  state.parentSku = event.target.value;
  renderVariantPreview();
  updateOutputMetrics();
  clearTimeout(form.saveTimer);
  form.saveTimer = setTimeout(saveDraft, 450);
});
$("#marketplace").addEventListener("change", () => {
  $("#singlePriceCurrency").textContent = currencySymbols[$("#marketplace").value] || "$";
  renderVariantRows();
  renderVariantPreview();
});
$("#variantRows").addEventListener("input", (event) => {
  const input = event.target.closest("[data-variant-field]");
  if (!input) return;
  const row = input.closest("[data-variant-index]");
  state.variants[Number(row.dataset.variantIndex)][input.dataset.variantField] = input.value;
  renderVariantPreview();
  updateOutputMetrics();
  clearTimeout(form.saveTimer);
  form.saveTimer = setTimeout(saveDraft, 450);
});
$("#variantRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-variant]");
  if (!button) return;
  state.variants.splice(Number(button.dataset.removeVariant), 1);
  renderVariantRows();
  renderVariantPreview();
  updateOutputMetrics();
  saveDraft();
});
$("#addVariantBtn").addEventListener("click", () => {
  state.variants.push(emptyVariant());
  renderVariantRows();
  updateOutputMetrics();
  saveDraft();
  $("#variantRows .variant-row:last-child input:not(.column-hidden)")?.focus();
});
form.addEventListener("input", (event) => {
  if (event.target.id === "keywordInput" || event.target.closest("#variationEditor")) return;
  $("#saveState").textContent = "Saving...";
  updateScore();
  clearTimeout(form.saveTimer);
  form.saveTimer = setTimeout(saveDraft, 450);
});
$("#listingOutput").addEventListener("input", () => { updateOutputMetrics(); saveDraft(); });
$("#listingOutput").addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const target = $(`#${button.dataset.copy}`);
  copyText(target.value ?? getBullets().map((item) => `• ${item}`).join("\n"));
});
$("#copyAllBtn").addEventListener("click", () => copyText(state.generated ? listingText() : "", "Full listing copied"));
$("#exportBtn").addEventListener("click", exportListing);
$("#resetBtn").addEventListener("click", resetDraft);
$("#mobileMenu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
$("#amazonTemplateFile").addEventListener("change", (event) => loadAmazonTemplate(event.target.files[0]));
$("#fillTemplateBtn").addEventListener("click", downloadFilledAmazonTemplate);
["dragenter", "dragover"].forEach((eventName) => $("#templateDrop").addEventListener(eventName, (event) => {
  event.preventDefault();
  $("#templateDrop").classList.add("dragging");
}));
["dragleave", "drop"].forEach((eventName) => $("#templateDrop").addEventListener(eventName, (event) => {
  event.preventDefault();
  $("#templateDrop").classList.remove("dragging");
}));
$("#templateDrop").addEventListener("drop", (event) => {
  const file = [...event.dataTransfer.files].find((item) => /\.xlsx$/i.test(item.name));
  if (file) loadAmazonTemplate(file);
  else toast("Choose an .xlsx Amazon template");
});
document.addEventListener("keydown", (event) => {
  if ($("#tutorialTour").hidden && (event.metaKey || event.ctrlKey) && event.key === "Enter") generateListing(event);
});

loadDraft();
updateScore();
