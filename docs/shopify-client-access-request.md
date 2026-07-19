# Shopify Client Access Request

This is the exact message to send to the Bass Binge Shopify owner. No Shopify
password should be requested or shared.

## Ready-to-Send Message

> I do not need your Shopify login or password. Shopify provides secure
> collaborator access specifically for developers working on customer stores.
>
> Please send me:
>
> 1. Your permanent `myshopify.com` store URL.
> 2. The four-digit collaborator request code from **Settings > Users >
>    Security > Collaborators**.
>
> I will submit a collaborator request for only the product and Headless
> storefront permissions needed to connect the website. Shopify will show you
> the request before anything is granted, and you can remove my access after
> setup. Please do not send your password.

Official Shopify reference:
[Collaborator accounts](https://help.shopify.com/en/manual/your-account/users/security/collaborator-accounts)

## Permissions to Approve

Approve only these permissions when the request arrives:

- Products: View
- Products: Create and edit
- Products: Edit price
- Inventory: View and adjust
- Files: View, create, and edit
- Apps and sales channels: access to **Headless**
- Manage and install apps and channels only if Headless is not installed yet

The website developer does not need access to:

- Customers
- Orders
- Shopify Payments or finances
- Gift cards
- Marketing
- Discounts
- Domains
- User administration

## If Collaborator Access Is Declined

Schedule a screen share and have the Shopify owner complete the items in
`docs/shopify-implementation-runbook.md` while the developer guides them. The
owner can create the Headless private token and deliver it through an approved
secure secret-sharing method. A Shopify password is never needed.

## Responsibility After Setup

### Shopify Owner

- Upload and assign product photographs
- Maintain inventory
- Create and schedule limited drops
- Manage orders and fulfillment
- Revoke or renew collaborator access

### Website Developer

- Maintain the catalog adapter and checkout integration
- Configure the Headless token in Vercel
- Validate Shopify product structure
- Deploy and monitor the storefront

The storefront discovers Shopify product and variant IDs automatically. Neither
party should copy IDs into page HTML or manually maintain SKU mappings in code.
