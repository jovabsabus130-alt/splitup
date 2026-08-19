# SplitUp PRD

## Problem Statement
People sharing trips or apartments struggle to track who paid for what, how much each person owes, and how to settle efficiently.

## Target Users
- Roommates sharing monthly costs
- Friends on group trips
- Small informal teams sharing event expenses

## Core Features
- User registration and login with JWT auth
- Group creation and member management (including group deletion)
- Expense creation with per-user split shares
- Ability to exclude individual members from a split when adding an expense
- Real-time remaining-amount indicator while configuring a split
- Group-level balance calculation and debt simplification
- AI-assisted expense text parsing into structured values
- Test-mode settlement payment intent generation and webhook completion

## UX Interactions

### Delete Group
- A **Delete Group** option is accessible from the group detail page (e.g., a settings menu or a danger-zone button at the bottom of the page).
- Triggering it shows a confirmation dialog to prevent accidental deletion.
- On confirmation, the group and all associated expenses, splits, and settlements are permanently removed.
- The user is redirected to the group list after deletion.

### Exclude a Person from a Split
- When adding or editing an expense, each group member listed in the split section has a **checkbox** (ticked by default, meaning "included").
- Unchecking a member's checkbox excludes them from the split; their share is removed and the remaining amount is redistributed proportionally among the still-included members.
- At least one member must remain included (the UI prevents deselecting everyone).

### Remaining Amount Indicator
- At the **top of the split section** in the add/edit expense form, a live counter displays:
  `Remaining to split: ₹<amount>`
- This value starts at the full expense amount and decreases as shares are assigned.
- It updates in real time as the user types share values or toggles member checkboxes.
- When the remaining amount reaches ₹0, the indicator turns green; if the splits exceed the total it turns red with a warning.

## Out of Scope
- Production payment onboarding or KYC
- Multi-currency conversion
- OCR receipt extraction from images
- Real-time notifications
- Native mobile apps
