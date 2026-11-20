# Month End Report Calculation Logic

The Month End Report provides a dynamic snapshot of inventory movements (Opening Balance, Stock In, Stock Out, and Closing Balance) for a selected month. Because the system does not save static, end-of-month snapshots, the report calculates these figures "on-the-fly" by working backwards from the current live stock and reversing historical transactions.

Here is a detailed breakdown of how the report operates, how dates and stock types are handled, and how each column is calculated.

## 1. Date and Time Handling

*   **Input**: The user selects a specific month (e.g., `2023-10`).
*   **Conversion**: The system converts this `YYYY-MM` input into a strict date range:
    *   `startDate`: The first day of the month (e.g., `2023-10-01`).
    *   `endDate`: The last day of that specific month (e.g., `2023-10-31`).
*   **Transaction Matching**: All calculations rely on comparing the `startDate` and `endDate` against the timestamp of each transaction.

## 2. Stock Type and Warehouse Scope

The report can be filtered by the source of the stock (Warehouse Scope) and Item Categories.

*   **MKT (Marketing Warehouse)**: Uses the primary `skus` list and primary `transactions` history.
*   **CS (Customer Service Warehouse)**: Uses the separate `csSkus` list and `csTransactions` history.
*   **All Stock (Combined)**: Calculates movements for MKT and CS independently, then merges the results. When merging, it sums the quantities and values for matched SKUs. It handles different `costPerUnit` values across warehouses by summing the total values rather than applying a single unit cost.
*   **Categories**: The report can be further filtered by selecting specific item categories (e.g., Merch, Booth).

## 3. How the Balances are Calculated

Since there is no saved snapshot, the system uses the **Current Stock** as the anchor point and rolls back transactions to find past balances.

### A. Opening Balance
**Definition**: The exact stock quantity at the very beginning of the selected period.
*   **Calculation**: Starts with the `Current Stock` and **rolls back** (reverses) every single transaction that occurred *on or after* the `startDate`.
    *   If a deduction occurred after the start date, it adds the quantity back.
    *   If an addition occurred after the start date, it subtracts the quantity out.
*   **The Finance Rule — Opening = last month's Closing**: the Opening Balance of a month is always exactly the Closing Balance of the month before. An item created during the month therefore opens at **0**; the stock it was created with (its "OPENING" transaction) is **Stock In** of that month, and becomes part of the Opening Balance only from the following month. Example: a hat created in June with 500 pcs and issued 500 in June reads Opening 0 / Stock In 500 / Stock Out 500 / Closing 0. The item is not listed in the months before it was created.

### B. Stock In
**Definition**: Total quantity added to the inventory during the selected month.
*   **Calculation**: Sums the quantities of all transactions explicitly marked as `addition` that fall strictly between the `startDate` and `endDate` (inclusive).
*   **What it includes**: The starting stock of an item created in this month, normal restocks, returned items, items transferred from another warehouse, and corrections that give stock back (an Admin ticket edit that reduces a ticket — `Edit Return` — and a late cancel — `Cancel Return`, see §6). Returned quantities are always positive Stock In, never a negative Stock Out.

### C. Stock Out
**Definition**: Total quantity removed from the inventory during the selected month.
*   **Calculation**: Sums the quantities of all transactions explicitly marked as `deduction` that fall strictly between the `startDate` and `endDate` (inclusive).
*   **What it includes**: Dispatched tickets, items consumed, or items transferred out.
*   **Which month a ticket counts in**: the ticket's **delivery date** — not the day it was created, approved or finalized. The booking (accrual) counts as Stock Out from the moment the ticket is submitted, also while it is still pending. A ticket rejected or recalled while its delivery month is still open simply disappears; one cancelled after its month was reported is handled as in §6.

### D. Closing Balance
**Definition**: The exact stock quantity at the very end of the selected period.
*   **Calculation**: Starts with the `Current Stock` and rolls back *only* the transactions that occurred *after* the `endDate`. It does not touch transactions that occurred during or before the selected month.
*   **Verification**: The system implicitly relies on the formula: `Opening + Stock In - Stock Out = Closing`. It even calculates a `variance` behind the scenes to ensure there are no discrepancies in the ledger.

## 4. Value Calculations (Financials)

For every quantity calculated (Opening, In, Out, Closing), the report also calculates a financial value.

*   **Formula**: `Value = Quantity * Unit Price (costPerUnit)`
*   **VAT Toggle**: If the user toggles "Include VAT (10%)", the `costPerUnit` is dynamically multiplied by `1.1` before the values are calculated, inflating the unit price and all resulting column values by 10% for reporting purposes.
*   **Known limit**: values use the item's **current** cost per unit for every month. Changing an item's cost re-prices months already reported, so Opening *value* can differ from last month's Closing *value* after a cost change (quantities always chain).

## 6. Reported Months Are Frozen (migration 0027)

Every month **before the current month** (Asia/Vientiane) counts as already reported to Finance, and nothing may be written into it any more. That is what keeps `Opening(M) = Closing(M−1)` true for every report you have already handed over.

| Action | Date in the current (or a future) month | Date in a reported month |
|---|---|---|
| Add SKU create date, Stock In / Stock Out date | allowed | refused — "Month closed" |
| Edit an item's Opening balance | allowed | refused — use Stock In / Stock Out this month |
| Correct a ledger row (Edit stock movement) | allowed | manual rows refused; a ticket row keeps its qty and the difference is posted **today** |
| New ticket with a delivery date in the past | booked on that date | booked **today** |
| Admin ticket edit | dated on the delivery date | dated **today** (`Edit Issue` = Stock Out, `Edit Return` = Stock In) |
| Approved qty changed at review | booking updated | booking kept; difference posted **today** |
| Ticket rejected / recalled | booking dropped (never shows) | booking stays in its month; a `Cancel Return` dated **today** gives the stock back (Stock In) |

The only things that move numbers between months are therefore ticket corrections, and they always land in the **current** month. Emergency maintenance in the SQL Editor can bypass the lock inside one transaction with `set local app.ledger_unlock = 'on';`.

## 5. Examples & Scenarios

To help illustrate how this works in practice, here are a few scenarios showing how the report calculates the numbers based on real-world actions.

### Scenario A: A Brand-New Item is Created
*   **Action**: On October 15th, you create a new item "Lanyard" and set the initial stock to 100 pcs.
*   **Behind the Scenes**: The system logs an `addition` transaction tagged as "OPENING" for 100 pcs on Oct 15th.
*   **October Month End Report**:
    *   **Opening Balance**: 0 (September's Closing — the item did not exist yet).
    *   **Stock In**: 100 (The stock the item was created with comes IN during October).
    *   **Stock Out**: 0
    *   **Closing Balance**: 100
*   **November Month End Report**: Opening 100 (= October's Closing).
*   **Why?**: Finance's rule is Opening = last month's Closing. September does not list the item at all (it did not exist yet).

### Scenario B: Generating a Past Month's Report
*   **Current Date**: December 5th. Current stock of "T-Shirts" is 50.
*   **Action**: You want to see the report for **October**.
*   **Transaction History for T-Shirts**:
    *   Oct 1: Started month with 100.
    *   Oct 10: Dispatched 30 (Stock Out).
    *   Nov 15: Restocked 20 (Stock In).
    *   Dec 2: Dispatched 40 (Stock Out).
*   **How the Report Calculates for October (`2023-10`)**:
    *   **Anchor**: Current stock is 50.
    *   **Closing Balance (End of Oct)**: System starts at 50, and rolls back the Nov 15th addition (-20) and the Dec 2nd deduction (+40). Result: 50 - 20 + 40 = **70**.
    *   **Stock In (Oct)**: 0 (No additions happened in October).
    *   **Stock Out (Oct)**: 30 (The Oct 10th dispatch).
    *   **Opening Balance (Start of Oct)**: System starts at Current Stock (50) and rolls back *everything* from Oct 1st onwards: Dec 2 deduction (+40), Nov 15 addition (-20), Oct 10 deduction (+30). Result: 50 + 40 - 20 + 30 = **100**.
*   **Final October Output**: Opening (100) + In (0) - Out (30) = Closing (70). 

### Scenario C: Warehouse Merging (All Stock)
*   **Action**: You select "All Stock" for the November report.
*   **Context**:
    *   MKT Warehouse has 50 "Notebooks" (Unit Cost: $10).
    *   CS Warehouse has 20 "Notebooks" (Unit Cost: $12).
*   **Calculation**:
    *   The system calculates the MKT row and CS row completely separately based on their own transaction histories.
    *   It then merges them by matching the SKU name.
    *   **Combined Qty**: 50 + 20 = 70.
    *   **Combined Value**: (50 * $10) + (20 * $12) = $500 + $240 = **$740**.
*   **Why?**: This accurately reflects the total financial value across the entire company, even when different warehouses acquired the stock at different price points.
