import { useState } from 'react';
import { Download, Plus, Trash2, X } from 'lucide-react';
import GuestBookingSelect from '../../components/GuestBookingSelect.jsx';
import { downloadInvoice, invoiceAddress, invoiceFromBooking, invoiceMoney, invoicePeriod, invoiceQuantity, invoiceSubtotal } from '../../lib/invoice.js';

const inputClass = 'w-full rounded border border-slate-300 bg-white p-2 text-sm text-slate-800';
export default function InvoiceModal({ isOpen, onClose, bookings }) {
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  if (!isOpen) return null;
  const selectBooking = (id) => {
    setSelectedBookingId(id);
    const booking = bookings.find((b) => b.id === id);
    setData(booking ? invoiceFromBooking(booking) : null);
    setError('');
  };
  const update = (key, value) => setData((current) => ({ ...current, [key]: value }));
  const updateItem = (index, key, value) => setData((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const subtotal = data ? invoiceSubtotal(data) : 0;
  const money = (value) => invoiceMoney(value, data.currency);
  const download = async () => {
    setError('');
    setDownloading(true);
    try { await downloadInvoice(data); } catch (err) { setError(err.message || 'Unable to download invoice. Please try again.'); }
    finally { setDownloading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="invoice-title" className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
          <h3 id="invoice-title" className="text-lg font-bold text-slate-800">Create Invoice</h3>
          <button onClick={onClose} aria-label="Close invoice" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={22} /></button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">
          <GuestBookingSelect bookings={bookings} value={selectedBookingId} onChange={selectBooking} />
          {data ? <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Invoice for<input className={inputClass} value={data.guestName} onChange={(e) => update('guestName', e.target.value)} /></label>
                <label className="text-sm">Invoice number<input className={inputClass} value={data.invoiceNumber} onChange={(e) => update('invoiceNumber', e.target.value)} /></label>
                <label className="text-sm">Currency<select className={inputClass} value={data.currency} onChange={(e) => update('currency', e.target.value)}>{Array.from(new Set([data.currency, 'VND', 'USD', 'EUR', 'GBP'])).map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              </div>
              <p className="text-xs text-slate-500">Confirm the currency and agreed amounts before downloading. Changing currency does not convert amounts.</p>
              {data.items.map((item, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-semibold">Line item {index + 1}</legend>
                <label className="block text-sm">Description<input className={inputClass} value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">From<input type="date" className={inputClass} value={item.startDate} onChange={(e) => updateItem(index, 'startDate', e.target.value)} /></label>
                  <label className="text-sm">To<input type="date" className={inputClass} value={item.endDate} onChange={(e) => updateItem(index, 'endDate', e.target.value)} /></label>
                  <label className="text-sm">Quantity<input type="number" min="1" step="1" className={inputClass} value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} /></label>
                  <label className="text-sm">Unit<select className={inputClass} value={item.unit || 'night'} onChange={(e) => updateItem(index, 'unit', e.target.value)}><option value="night">Nights</option><option value="month">Months</option></select></label>
                  <label className="text-sm">Total price ({data.currency})<input type="number" min="0" step={data.currency === 'VND' ? '1' : '0.01'} className={inputClass} value={item.amount} onChange={(e) => updateItem(index, 'amount', e.target.value)} /></label>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500"><span>Unit price: {money(item.quantity > 0 ? item.amount / item.quantity : 0)}</span><button disabled={data.items.length === 1} onClick={() => update('items', data.items.filter((_, i) => i !== index))} aria-label={`Remove line item ${index + 1}`} className="p-1 text-red-600 disabled:opacity-30"><Trash2 size={16} /></button></div>
              </fieldset>)}
              <button onClick={() => update('items', [...data.items, { description: '', startDate: '', endDate: '', quantity: 1, unit: 'night', amount: 0 }])} className="flex items-center gap-2 text-sm font-semibold text-[#30492f]"><Plus size={16} />Add line item</button>
              <label className="block text-sm">Payable now ({data.currency})<input type="number" min="0" max={subtotal} step={data.currency === 'VND' ? '1' : '0.01'} placeholder="Enter agreed deposit" className={inputClass} value={data.payableNow} onChange={(e) => update('payableNow', e.target.value)} /></label>
              <label className="block text-sm">Cancellation Policy<textarea rows={9} className={inputClass} value={data.policy} onChange={(e) => update('policy', e.target.value)} /></label>
            </div>
            <div className="overflow-x-auto rounded border bg-slate-100 p-3">
              <article className="min-w-[430px] bg-[#fffbe3] text-[11px] text-black shadow-sm">
                <header className="bg-[#30492f] px-10 py-8 text-[#fffbe3]"><h1 className="text-xl font-bold">INVOICE</h1><p className="text-sm">Kolab Living</p><p className="mt-1 whitespace-pre-line text-[10px]">{invoiceAddress}</p></header>
                <div className="px-8 py-7">
                  <div className="grid grid-cols-[1fr_1.2fr_0.8fr] gap-4 break-words"><div><b>Invoice for</b><p className="mt-1">{data.guestName}</p></div><div><b>Payable to</b><p className="mt-1">Kolab Living Company Limited</p><p className="whitespace-pre-line">{invoiceAddress}</p></div><div><b>Invoice #</b><p className="mt-1">{data.invoiceNumber}</p></div></div>
                  <table className="mt-9 w-full border-t border-[#c7c7b9] text-left"><thead><tr>{['Description', 'Qty', 'Unit price', 'Total price'].map((label, i) => <th key={label} className={`py-4 ${i ? 'text-right pl-2' : ''}`}>{label}</th>)}</tr></thead><tbody>{data.items.map((item, i) => <tr key={i}><td className="pb-3 pr-2"><p className="break-words">{item.description}</p><p className="text-[9px]">{invoicePeriod(item)}</p></td><td className="pb-3 text-right">{invoiceQuantity(item)}</td><td className="pb-3 pl-2 text-right whitespace-nowrap">{money(item.quantity > 0 ? item.amount / item.quantity : 0)}</td><td className="pb-3 pl-2 text-right whitespace-nowrap">{money(item.amount)}</td></tr>)}</tbody></table>
                  <dl className="ml-auto mt-9 w-fit min-w-[55%] border-t border-[#c7c7b9] pt-1 text-right font-bold">{[['Subtotal', money(subtotal)], ['Payable now:', data.payableNow === '' ? '—' : money(data.payableNow)], ['Payment on arrival:', data.payableNow === '' ? '—' : money(subtotal - Number(data.payableNow))]].map(([label, value]) => <div key={label} className="flex justify-between gap-5 py-0.5"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                  <div className="mt-3 min-h-48 border-t border-[#c7c7b9] pt-2"><b>Cancellation Policy:</b><p className="mt-4 whitespace-pre-line text-[10px] leading-relaxed">{data.policy}</p></div>
                </div>
              </article>
            </div>
          </div> : <p className="py-16 text-center text-slate-400">Select a booking above to generate an invoice preview.</p>}
        </div>
        <div className="border-t bg-slate-50 px-6 py-4">
          {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-slate-600">Close</button><button disabled={!data || downloading} onClick={download} className="flex items-center gap-2 rounded-lg bg-[#30492f] px-5 py-2 text-white disabled:opacity-40"><Download size={16} />{downloading ? 'Generating…' : 'Download PDF'}</button></div>
        </div>
      </div>
    </div>
  );
}
