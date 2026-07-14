#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(
  projectRoot,
  "docs",
  "tutorial",
  "examples",
  "demo-apparel-amazon-template.xlsx"
);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function stringCell(column, row, value) {
  const reference = columnName(column) + row;
  return '<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' +
    escapeXml(value) + "</t></is></c>";
}

function row(number, values) {
  const cells = values.map(function (value, index) {
    return stringCell(index + 1, number, value);
  }).join("");
  return '<row r="' + number + '">' + cells + "</row>";
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value >>> 0);
  return bytes;
}

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
}

function buildZip(entries) {
  const bodies = [];
  const central = [];
  let offset = 0;

  entries.forEach(function (entry) {
    const name = Buffer.from(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      name
    ]);

    bodies.push(localHeader, data);
    central.push(Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name
    ]));
    offset += localHeader.length + data.length;
  });

  const centralDirectory = Buffer.concat(central);
  const end = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);
  return Buffer.concat(bodies.concat([centralDirectory, end]));
}

const headers = [
  "product_type",
  "parentage",
  "parent_sku",
  "relationship_type",
  "variation_theme",
  "item_sku",
  "external_product_id_type",
  "external_product_id",
  "item_name",
  "size_name",
  "brand_name",
  "model_name",
  "standard_price",
  "quantity",
  "condition_type",
  "bullet_point1",
  "bullet_point2",
  "bullet_point3",
  "bullet_point4",
  "product_description",
  "generic_keywords",
  "update_delete"
];

const worksheetXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<dimension ref="A1:V3"/>',
  "<sheetData>",
  row(1, ["DEMO ONLY - synthetic Amazon-style template. Do not upload this file to Seller Central."]),
  row(2, headers),
  "</sheetData>",
  "</worksheet>"
].join("");

const entries = [
  {
    name: "[Content_Types].xml",
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      "</Types>"
  },
  {
    name: "_rels/.rels",
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
  },
  {
    name: "xl/workbook.xml",
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets><sheet name=\"Template\" sheetId=\"1\" r:id=\"rId1\"/></sheets>" +
      "</workbook>"
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      "</Relationships>"
  },
  {
    name: "xl/worksheets/sheet1.xml",
    data: worksheetXml
  }
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buildZip(entries));
process.stdout.write("Created synthetic tutorial workbook: " + path.relative(projectRoot, outputPath) + "\n");
