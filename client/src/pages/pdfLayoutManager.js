/**
 * pdfLayoutManager.js
 *
 * Tracks chart/element positions and sizes on an 8.5 × 11 inch PDF page.
 * All coordinates are stored in POINTS (1 inch = 72 pt), which is the native
 * unit used by jsPDF — so values here can be passed directly to jsPDF without
 * any conversion.
 *
 * Page dimensions
 *   Width  : 8.5 in  = 612 pt
 *   Height : 11  in  = 792 pt
 *
 * Usage
 * ─────
 *   import { createLayout, saveLayout, loadLayout, applyLayoutToPDF } from './pdfLayoutManager';
 *
 *   // 1. Create (or load) a layout
 *   const layout = loadLayout('executive') ?? createLayout('executive');
 *
 *   // 2. Add / update elements
 *   layout.setElement('keywordChart', { x: 36, y: 80, width: 540, height: 220 });
 *   layout.setElement('toneChart',    { x: 36, y: 320, width: 540, height: 220 });
 *
 *   // 3. Persist to localStorage
 *   saveLayout(layout);
 *
 *   // 4. When generating the PDF, apply the layout
 *   applyLayoutToPDF(pdf, layout, { keywordChart: imgDataUrl, toneChart: imgDataUrl2 });
 */

// Helper to center an element of given width/height on the page
function centerElement(width, height) {
  const x = Math.round((PAGE.WIDTH_PT - width) / 2);
  const y = Math.round((PAGE.HEIGHT_PT - height) / 2);
  return { x, y, width, height };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAGE = {
  WIDTH_IN:  8.5,
  HEIGHT_IN: 11,
  WIDTH_PT:  612,   // 8.5 * 72
  HEIGHT_PT: 792,   // 11  * 72
  MARGIN_PT: 36,    // 0.5 in margin
};

export const STORAGE_KEY_PREFIX = 'chibitek-pdf-layout:';

// ─── Default layouts per template ────────────────────────────────────────────

const DEFAULT_LAYOUTS = {
  executive: {
    id: "executive",
    label: "Executive Summary",
    elements: {
      keywordChart: { x: 36, y: 80,  width: 540, height: 240 },
      toneChart:    { x: 36, y: 340, width: 540, height: 240 },
    },
  },

  visual: {
    id: "visual",
    label: "Visual Report",
    elements: {
      keywordChart: { x: 36,  y: 60,  width: 540, height: 300 },
      toneChart:    { x: 36,  y: 380, width: 540, height: 300 },
    },
  },

  compact: {
    id: "compact",
    label: "Compact Data",
    elements: {
      keywordChart: { x: 36,  y: 80, width: 258, height: 220 },
      toneChart:    { x: 318, y: 80, width: 258, height: 220 },
    },
  },
};

// ─── Layout class ─────────────────────────────────────────────────────────────

class PDFLayout {
  /**
   * @param {string} templateId  - 'executive' | 'visual' | 'compact'
   * @param {object} [override]  - optional JSON snapshot to restore from
   */
  constructor(templateId, override = null) {
    const base = DEFAULT_LAYOUTS[templateId] ?? DEFAULT_LAYOUTS.executive;

    this.id        = base.id;
    this.label     = base.label;
    this.updatedAt = null;

    // Deep-clone the default then apply any saved overrides
    this.elements = JSON.parse(JSON.stringify(base.elements));
    if (override?.elements) {
      for (const [key, val] of Object.entries(override.elements)) {
        this.elements[key] = { ...this.elements[key], ...val };
      }
      this.updatedAt = override.updatedAt ?? null;
    }
  }

  // ── Element getters / setters ─────────────────────────────────────────────

  /** Return a copy of a single element's layout rect. */
  getElement(name) {
    return this.elements[name] ? { ...this.elements[name] } : null;
  }

  /**
   * Update (merge) an element's position/size.
   * @param {string} name
   * @param {{ x?: number, y?: number, width?: number, height?: number, type?: string }} rect
   */
  setElement(name, rect) {
    if (!this.elements[name]) {
      this.elements[name] = { x: 0, y: 0, width: 100, height: 100, type: 'image' };
    }
    this.elements[name] = { ...this.elements[name], ...sanitizeRect(rect) };
    this.updatedAt = new Date().toISOString();
    return this; // chainable
  }

  /** Remove an element from the layout. */
  removeElement(name) {
    delete this.elements[name];
    this.updatedAt = new Date().toISOString();
    return this;
  }

  /** List all element names. */
  elementNames() {
    return Object.keys(this.elements);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Returns an array of warning strings for elements that overflow the page
   * or overlap each other.
   */
  validate() {
    const warnings = [];
    const entries  = Object.entries(this.elements);

    entries.forEach(([name, el]) => {
      if (el.x < 0 || el.y < 0) {
        warnings.push(`"${name}" has negative coordinates (x:${el.x}, y:${el.y}).`);
      }
      if (el.x + el.width > PAGE.WIDTH_PT) {
        warnings.push(`"${name}" overflows the right edge of the page.`);
      }
      if (el.y + el.height > PAGE.HEIGHT_PT) {
        warnings.push(`"${name}" overflows the bottom of the page.`);
      }
    });

    // Pairwise overlap check (image elements only)
    const images = entries.filter(([, el]) => el.type === 'image');
    for (let i = 0; i < images.length; i++) {
      for (let j = i + 1; j < images.length; j++) {
        const [nameA, a] = images[i];
        const [nameB, b] = images[j];
        if (rectsOverlap(a, b)) {
          warnings.push(`"${nameA}" and "${nameB}" overlap.`);
        }
      }
    }

    return warnings;
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  toJSON() {
    return {
      id:        this.id,
      label:     this.label,
      updatedAt: this.updatedAt,
      page: {
        widthPt:  PAGE.WIDTH_PT,
        heightPt: PAGE.HEIGHT_PT,
        unit:     'pt',
      },
      elements: JSON.parse(JSON.stringify(this.elements)),
    };
  }

  toString() {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a fresh layout for the given template, starting from defaults.
 * @param {'executive'|'visual'|'compact'} templateId
 * @returns {PDFLayout}
 */
export function createLayout(templateId) {
  return new PDFLayout(templateId);
}

/**
 * Persist a layout to localStorage.
 * @param {PDFLayout} layout
 */
export function saveLayout(layout) {
  const key = STORAGE_KEY_PREFIX + layout.id;
  try {
    localStorage.setItem(key, layout.toString());
  } catch (err) {
    console.error('[pdfLayoutManager] Could not save layout:', err);
  }
}

/**
 * Load a saved layout from localStorage.
 * Returns null if nothing is saved for that template.
 * @param {'executive'|'visual'|'compact'} templateId
 * @returns {PDFLayout|null}
 */
export function loadLayout(templateId) {
  const key = STORAGE_KEY_PREFIX + templateId;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return new PDFLayout(templateId, parsed);
  } catch (err) {
    console.error('[pdfLayoutManager] Could not load layout:', err);
    return null;
  }
}

/**
 * Reset a template back to its built-in defaults and clear localStorage.
 * @param {'executive'|'visual'|'compact'} templateId
 * @returns {PDFLayout}
 */
export function resetLayout(templateId) {
  const key = STORAGE_KEY_PREFIX + templateId;
  try { localStorage.removeItem(key); } catch { }
  return new PDFLayout(templateId);
}

/**
 * Export all saved layouts as a single JSON string (for download / backup).
 * @returns {string}
 */
export function exportAllLayouts() {
  const out = {};
  for (const id of Object.keys(DEFAULT_LAYOUTS)) {
    const layout = loadLayout(id) ?? createLayout(id);
    out[id] = layout.toJSON();
  }
  return JSON.stringify(out, null, 2);
}

/**
 * Import layouts from a JSON string (previously exported with exportAllLayouts).
 * Overwrites localStorage entries for any template found in the JSON.
 * @param {string} jsonString
 */
export function importLayouts(jsonString) {
  const data = JSON.parse(jsonString);
  for (const [id, snapshot] of Object.entries(data)) {
    if (!DEFAULT_LAYOUTS[id]) continue; // ignore unknown templates
    const layout = new PDFLayout(id, snapshot);
    saveLayout(layout);
  }
}

/**
 * Apply a layout to a jsPDF instance by drawing image elements from a map.
 *
 * @param {import('jspdf').jsPDF} pdf        - jsPDF instance (already configured, unit: 'pt')
 * @param {PDFLayout}             layout     - layout to use
 * @param {Object.<string,string>} imageMap  - { elementName: base64DataUrl, … }
 * @param {Object} [options]
 * @param {boolean} [options.drawGuides]     - draw faint bounding-box guides (debug)
 */
export function applyLayoutToPDF(pdf, layout, imageMap = {}, { drawGuides = false } = {}) {
  const warnings = layout.validate();
  if (warnings.length) {
    console.warn('[pdfLayoutManager] Layout warnings:\n  ' + warnings.join('\n  '));
  }

  for (const [name, el] of Object.entries(layout.elements)) {
    if (drawGuides) {
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.5);
      pdf.rect(el.x, el.y, el.width, el.height, 'S');
    }

    if (el.type === 'image' && imageMap[name]) {
      pdf.addImage(imageMap[name], 'PNG', el.x, el.y, el.width, el.height);
    }
    // Text elements are intentionally left for the caller to render
    // (they need access to translated strings etc.)
  }
}

/**
 * Convenience: convert inches to points.
 * @param {number} inches
 * @returns {number}
 */
export function inToPt(inches) { return inches * 72; }

/**
 * Convenience: convert points to inches.
 * @param {number} pt
 * @returns {number}
 */
export function ptToIn(pt) { return pt / 72; }

// ─── Internal helpers ─────────────────────────────────────────────────────────

function sanitizeRect(rect) {
  const out = {};
  if (typeof rect.x      === 'number') out.x      = Math.round(rect.x);
  if (typeof rect.y      === 'number') out.y      = Math.round(rect.y);
  if (typeof rect.width  === 'number') out.width  = Math.max(1, Math.round(rect.width));
  if (typeof rect.height === 'number') out.height = Math.max(1, Math.round(rect.height));
  if (rect.type) out.type = rect.type;
  return out;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width  &&
    a.x + a.width  > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}