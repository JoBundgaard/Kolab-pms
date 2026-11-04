import { useMemo, useState } from 'react';
import { Plus, X, Wallet } from 'lucide-react';
import { buildFinanceReport, FINANCE_CATEGORIES, FINANCE_SCOPES, financeToday } from '../../lib/propertyFinance.js';
import { saveFinanceEntry, settleFinanceEntry, voidFinanceEntry } from '../../services/propertyFinanceService.js';
import useFinance from './useFinance.js';

const money = (value) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0)} ₫`;
const scopeName = (id) => FINANCE_SCOPES.find((p) => p.id === id)?.name || 'Unassigned';
const categoryName = (entry) => FINANCE_CATEGORIES.find((c) => c.id === entry.category)?.label || (entry.kind === 'payout' ? 'Airbnb payout' : 'Other income');
const inputClass = 'w-full mt-1 rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900';
const buttonClass = 'rounded-full px-4 py-2 text-sm font-semibold bg-[#164D42] text-white disabled:opacity-40';

function EntryForm({ entry, onClose, onSave }) {
  const [form, setForm] = useState(() => entry ? { ...entry, paymentDate: financeToday() } : {
    actionId: crypto.randomUUID(), kind: 'expense', propertyId: 'prop_1', category: 'rent', amountVnd: '',
    description: '', date: financeToday(), paymentDate: '', method: '', reference: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError(''); setBusy(true);
    try { await onSave(form); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="finance-entry-title" className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4"><h3 id="finance-entry-title" className="text-xl font-serif">{entry ? 'Record full payment' : 'Add finance entry'}</h3><button aria-label="Close finance entry" disabled={busy} onClick={onClose}><X size={20} /></button></div>
      <form onSubmit={submit} className="space-y-4">
        {entry ? <p>{entry.description} · {money(entry.amountVnd)}<br /><span className="text-sm text-slate-500">Records the full amount. For partial payments, split the bill into separate entries first.</span></p> : <>
          <label className="block text-sm">Entry type<select autoFocus className={inputClass} value={form.kind} onChange={(e) => set('kind', e.target.value)}><option value="expense">Expense / cash out</option><option value="other_income">Other income (outside guest billing)</option><option value="payout">Airbnb payout received</option></select></label>
          <p className="text-xs text-slate-500">{form.kind === 'payout' ? 'Cash receipt only. Accommodation income is already calculated from bookings.' : form.kind === 'other_income' ? 'Do not re-enter guest payments or services already recorded in CRM.' : 'Loan principal and owner drawings affect cash movement, not profit.'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">Property<select className={inputClass} value={form.propertyId} onChange={(e) => set('propertyId', e.target.value)}>{FINANCE_SCOPES.filter((p) => p.id !== 'unassigned').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {form.kind === 'expense' && <label className="text-sm">Category<select className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>{FINANCE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
          </div>
          <label className="block text-sm">Description / supplier<input required maxLength={500} className={inputClass} value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-sm">Amount (VND)<input required type="number" min="1" step="1" className={inputClass} value={form.amountVnd} onChange={(e) => set('amountVnd', e.target.value)} /></label><label className="text-sm">{form.kind === 'expense' ? 'Expense belongs to date' : 'Income belongs to date'}<input required type="date" className={inputClass} value={form.date} onChange={(e) => set('date', e.target.value)} /></label></div>
        </>}
        <label className="block text-sm">Actual {form.kind === 'expense' ? 'payment' : 'receipt'} date {form.kind !== 'payout' && !entry && '(leave blank if unpaid)'}<input required={!!entry || form.kind === 'payout'} type="date" max={financeToday()} className={inputClass} value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} /></label>
        <label className="block text-sm">Account / payment method<input required={!!form.paymentDate} maxLength={120} placeholder="e.g. Vietnamese bank account, Wise, cash" className={inputClass} value={form.method} onChange={(e) => set('method', e.target.value)} /></label>
        <label className="block text-sm">Reference<input maxLength={200} className={inputClass} value={form.reference} onChange={(e) => set('reference', e.target.value)} /></label>
        {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save entry'}</button></div>
      </form>
    </section>
  </div>;
}

export default function FinanceView({ db, user, bookings, crm, bookingsError }) {
  const [month, setMonth] = useState(() => financeToday().slice(0, 7));
  const [propertyId, setPropertyId] = useState('all');
  const [tab, setTab] = useState('overview');
  const [editor, setEditor] = useState(null);
  const [voidEntry, setVoidEntry] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const finance = useFinance(db, user?.uid, month);
  const report = useMemo(() => buildFinanceReport({ bookings, payments: crm.payments, entries: finance.entries, month, propertyId }), [bookings, crm.payments, finance.entries, month, propertyId]);
  const error = finance.error || crm.error || bookingsError;
  const ready = finance.ready && !crm.loading && !error;
  const entries = finance.entries.filter((e) => propertyId === 'all' || e.propertyId === propertyId).sort((a, b) => b.date.localeCompare(a.date));
  const save = async (form) => {
    if (!ready || !navigator.onLine) throw new Error('Wait for finance to sync and reconnect before saving.');
    if (editor.entry) await settleFinanceEntry({ db, user, entryId: editor.entry.id, ...form });
    else await saveFinanceEntry({ db, user, actionId: form.actionId, input: form });
  };
  const voidSelected = async () => {
    if (!ready || !navigator.onLine) return;
    setBusy(true); setActionError('');
    try { await voidFinanceEntry({ db, user, entryId: voidEntry.id, reason }); setVoidEntry(null); setReason(''); }
    catch (e) { setActionError(e.message); } finally { setBusy(false); }
  };
  return <div className="space-y-6 pb-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-3xl font-serif font-bold text-[#164D42] flex items-center gap-3"><Wallet /> Finance</h2><p className="text-slate-500 mt-2">Property performance and recorded money movements.</p></div><button disabled={!ready} className={`${buttonClass} flex items-center gap-2`} onClick={() => setEditor({ entry: null })}><Plus size={18} /> Add entry</button></div>
    <div className="flex flex-wrap gap-4"><label className="text-sm">Reporting month<input type="month" required value={month} className={inputClass} onChange={(e) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} /></label><label className="text-sm">Property<select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="all">All properties & company costs</option>{FINANCE_SCOPES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
    <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900">Provisional management report. Accommodation uses existing PMS net prices after platform deductions, allocated to stay dates. CRM receipts are cash records, not extra revenue. Historical Sheets data and bank reconciliation have not been imported. Shared costs remain separate from individual properties.</p>
    {error ? <p role="alert" className="bg-red-50 text-red-800 rounded-xl p-4">Finance is unavailable: {error}. Check your connection or ask an administrator to confirm your finance access. Totals are hidden until all records sync.</p> : !ready && <p role="status" className="p-4 bg-slate-100 rounded-xl">Waiting for current finance and CRM records…</p>}
    <div className="flex gap-2 flex-wrap" aria-label="Finance views">{[['overview', 'Overview'], ['entries', 'Entries'], ['income', 'Booking income'], ['receipts', 'CRM receipts']].map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-sm ${tab === id ? 'bg-[#164D42] text-white' : 'bg-white border text-slate-600'}`}>{label}</button>)}</div>
    {ready && <>
      {tab === 'overview' && <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[['Net accommodation', report.netAccommodation], ['Costs affecting profit', report.operating + report.overhead + report.interest + report.tax], ['Estimated profit', report.profit], ['Recorded net cash movement', report.cashMovement]].map(([label, amount]) => <div key={label} className="bg-white rounded-2xl border p-5"><p className="text-sm text-slate-500">{label}</p><p className={`text-xl font-semibold mt-3 ${amount < 0 ? 'text-red-700' : 'text-[#164D42]'}`}>{money(amount)}</p></div>)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><section className="bg-white border rounded-2xl p-5"><h3 className="font-semibold mb-4">Income & costs by reporting month</h3><dl className="space-y-3"><Line label="Net accommodation estimate" amount={report.netAccommodation} /><Line label="Other income" amount={report.otherIncome} />{report.categories.filter((c) => c.group !== 'financing').map((c) => <Line key={c.id} label={c.label} amount={-c.amountVnd} />)}<Line label="Estimated profit after recorded costs" amount={report.profit} /></dl></section>
        <section className="bg-white border rounded-2xl p-5"><h3 className="font-semibold mb-4">Cash movement by actual receipt/payment date</h3><dl className="space-y-3"><Line label="CRM receipts (including deposits & advances)" amount={report.crmReceipts} /><Line label="Other receipts & Airbnb payouts" amount={report.manualReceipts} /><Line label="Paid expenses, debt principal & drawings" amount={-report.cashOut} /><Line label="Recorded net cash movement" amount={report.cashMovement} /><Line label="Month's expenses still unpaid at month end" amount={report.unpaidExpenses} /></dl><p className="text-sm text-slate-500 mt-6">This is not a bank balance. Opening balances, transfers, security refunds/deductions, and bank matching are not yet included. Reversed CRM receipts are excluded from their original receipt month.</p><p className="text-sm text-slate-500 mt-3">Property profit excludes unallocated company costs. Loan principal and owner drawings are cash outflows only. Booking estimates use the existing calendar-month rent allocation and can differ from CRM rent-date invoices.</p></section></div>
      </>}
      {tab === 'entries' && <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50"><tr>{['Date / property', 'Description / category', 'Amount', 'Payment', 'Actions'].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className={`border-t ${entry.status === 'void' ? 'text-slate-400' : ''}`}><td className="p-4 whitespace-nowrap">{entry.date}<br />{scopeName(entry.propertyId)}</td><td className="p-4">{entry.description}<br /><span className="text-xs">{categoryName(entry)} · {entry.createdByName}</span>{entry.status === 'void' && <p>Voided: {entry.voidReason}</p>}</td><td className="p-4 whitespace-nowrap">{entry.kind === 'expense' ? '−' : '+'}{money(entry.amountVnd)}</td><td className="p-4">{entry.paymentDate || 'Unpaid / not received'}<br />{entry.method}{entry.reference && <p className="text-xs">{entry.reference}</p>}</td><td className="p-4">{entry.sourceType && <span className="text-xs text-slate-500">Managed in Staff &amp; pay</span>}{entry.status === 'active' && !entry.sourceType && <div className="flex gap-3">{!entry.paymentDate && <button className="text-[#164D42] underline" onClick={() => setEditor({ entry })}>Record payment</button>}<button className="text-red-700 underline" onClick={() => { setVoidEntry(entry); setReason(''); setActionError(''); }}>Void</button></div>}</td></tr>)}</tbody></table>{!entries.length && <p className="p-8 text-slate-500">No finance entries for this month. Add an expense, other income, or a received Airbnb payout.</p>}</div>}
      {tab === 'income' && <section className="bg-white border rounded-2xl p-5"><h3 className="font-semibold mb-3">Accommodation by stay month · net estimate</h3><p className="text-sm text-slate-500 mb-4">Uses PMS prices; not verified against the finance sheet or bank. Services, waivers and manual CRM charges are not included in this estimate.</p>{report.incomeRows.map((r) => <div key={r.id} className="border-t py-3 flex justify-between gap-4 text-sm"><span>{r.description}<span className="block text-slate-500">{scopeName(r.propertyId)} · {r.channel}</span></span><span className="whitespace-nowrap">{money(r.amountVnd)}</span></div>)}{!report.incomeRows.length && <p>No booking income in this month.</p>}</section>}
      {tab === 'receipts' && <section className="bg-white border rounded-2xl p-5"><h3 className="font-semibold mb-3">Existing CRM receipts · no duplicate entry required</h3><p className="text-sm text-slate-500 mb-4">Includes security deposits and advances. Property follows the room at receipt date, or the original booked property for advance payments. Correct receipts in Guests & CRM.</p>{report.receipts.map((r) => <div key={r.id} className="border-t py-3 flex justify-between gap-4 text-sm"><span>{r.description}<span className="block text-slate-500">{r.receivedDate} · {scopeName(r.propertyId)} · {r.method}</span>{r.reference}</span><span className="whitespace-nowrap">{money(r.amountVnd)}</span></div>)}{!report.receipts.length && <p>No active CRM receipts in this month.</p>}</section>}
    </>}
    {editor && <EntryForm entry={editor.entry} onClose={() => setEditor(null)} onSave={save} />}
    {voidEntry && <div className="fixed inset-0 bg-black/40 z-50 p-4 flex items-center justify-center"><section role="dialog" aria-modal="true" aria-labelledby="void-title" className="bg-white rounded-2xl p-6 max-w-md w-full"><h3 id="void-title" className="font-semibold">Void {voidEntry.description}?</h3><p className="text-sm text-slate-500 mt-2">Removes this entry from totals and retains it with your reason. This does not move or refund money.</p><label className="block text-sm mt-4">Reason<input autoFocus required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></label>{actionError && <p role="alert" className="text-red-700">{actionError}</p>}<div className="flex justify-end gap-4 mt-5"><button disabled={busy} onClick={() => setVoidEntry(null)}>Cancel</button><button disabled={!reason.trim() || busy || !ready} onClick={voidSelected} className={buttonClass}>{busy ? 'Saving…' : 'Void entry'}</button></div></section></div>}
  </div>;
}

function Line({ label, amount }) {
  return <div className="flex justify-between gap-4 text-sm"><dt className="text-slate-600">{label}</dt><dd className="whitespace-nowrap font-medium">{money(amount)}</dd></div>;
}
