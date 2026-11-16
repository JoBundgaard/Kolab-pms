# Guest lease contracts

Open **Guests & CRM**, select a guest and stay, then choose **Lease contract**.
Set the contract start, check-out and agreement dates. Review the autofilled details,
complete missing information, confirm review, and download the PDF.

The generated PDF retains all seven sections, operator details, bank details and
unsigned signature lines from the supplied Kolab master template. The template is
stored as text blocks in `src/config/leaseTemplate.json`; its editing instructions
are excluded from the generated contract. PDF generation happens in the browser.

Guest identity/contact, room type/number, dated monthly rent (including room moves),
booking services and available reservation/arrival amounts come from the selected
PMS records. Unavailable details require manual completion. Enter explicit zero
amounts or “None” where applicable. The reservation deposit is a payment toward
rent, not an added security deposit. Financial amounts require review and are not
recalculated for custom contract dates. Date changes, room moves and stay breaks
show review notices. Internal guest notes are not copied into agreed legal notes.

Form changes are local to the contract: they do not update the booking, guest,
property or ledger. Contracts are downloaded, not stored in the PMS, signed or sent.
