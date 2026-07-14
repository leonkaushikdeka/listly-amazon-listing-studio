# Create an Amazon upload workbook with Listly

This walkthrough shows the complete Listly side of Amazon's spreadsheet workflow with a fictional apparel variation family. The recording is generated with Playwright against the app in this repository, so every on-screen action uses the real workbook mapper.

[![Play the recorded Listly workbook walkthrough](tutorial/listly-amazon-workbook-walkthrough.gif)](tutorial/listly-amazon-workbook-walkthrough.webm)

[Open the full WebM recording](tutorial/listly-amazon-workbook-walkthrough.webm) if the preview does not animate.

> Important: the workbook in this tutorial is synthetic. It demonstrates header detection and file generation only. Do not upload the supplied demo files to Seller Central. Always start from the blank workbook Amazon generates for your marketplace, category, and product type.

## What the recording demonstrates

The example creates a new size variation family:

| Field | Demo value |
| --- | --- |
| Marketplace | Amazon.com (United States) |
| Category | Clothing & Accessories |
| Product | Organic Cotton Crew Neck T-Shirt |
| Parent SKU | NP-DEMO-TEE-PARENT |
| Child sizes | S, M, L, XL |
| Child price | $24.99 |
| Product identifier | Demo uses GTIN exemption only |

The final demo file contains one non-buyable parent and four buyable child rows. In a real listing, each child needs valid offer data and, unless Amazon has approved a GTIN exemption for the account and product, its own valid product identifier.

## Before using Listly

1. In Seller Central, go to Catalog > Add Products > Spreadsheet.

2. Select Download blank template.

3. Choose the right marketplace, category, product type, and template purpose for the item you are listing.

4. Download the blank .xlsx file and keep it unchanged until you upload it to Listly.

Amazon's current seller guidance describes this same Spreadsheet path, then directs sellers to choose Download blank template and later Upload file after completing it. [Amazon's product-listing guide](https://sell.amazon.com/blog/how-to-create-a-new-asin-amazon?mons_sel_locale=en_US) and [variation guide](https://sell.amazon.com/blog/amazon-variation-listing) are the authoritative references for the Seller Central side of the workflow.

## Use Listly to fill the workbook

1. Enter the shared product details: product name, brand, model, benefits, audience, and search terms.

2. Select the right marketplace and category. These help document the draft; the exact requirements still come from the Amazon template you selected.

3. If the product has size or color options, turn on This product has variations.

4. Choose New variation family for a new parent plus its children, or Add to existing family to export only new children linked to an existing Amazon parent.

5. Enter the parent SKU, variation theme, child SKUs, price, stock, and valid product identifiers. Create the listing and review the generated title, bullets, and description.

6. In Create Amazon upload workbook, choose the untouched blank .xlsx exported by Seller Central.

7. Read the mapping report. It shows the detected worksheet, header row, number of mapped fields, and any critical columns it could not map. Do not continue until it reports that the required columns are mapped.

8. Select Fill and download Amazon workbook. Listly writes the generated parent/child records into the detected template sheet and downloads a file ending in -filled.xlsx.

## Finish in Seller Central

1. Go back to Catalog > Add Products > Spreadsheet.

2. Select Upload file and choose the -filled.xlsx file created from your real Amazon template.

3. Follow the on-screen prompts and wait for Amazon to process the upload.

4. Read Amazon's processing report before considering the listing complete. Amazon may require category-specific values that Listly cannot infer, such as materials, compliance attributes, dimensions, images, or a valid GTIN.

Listly prepares the workbook locally in the browser. It does not submit listings, access Seller Central, or bypass Amazon's review.

## Demo files

- [Synthetic blank workbook](tutorial/examples/demo-apparel-amazon-template.xlsx)
- [Workbook produced in the recording](tutorial/examples/demo-apparel-amazon-template-filled.xlsx)
- [Screenshots from the recorded flow](tutorial/screenshots/)

Both .xlsx files are teaching fixtures with Amazon-style headers, not Amazon-issued templates.

## Regenerate the tutorial

The checked-in recording can be recreated after changing the interface or the walkthrough script:

    npm run tutorial

That command creates the synthetic workbook, records the scenario with Playwright, saves the filled example, captures three screenshots, and produces the animated GitHub preview.
