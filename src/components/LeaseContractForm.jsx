import { useState } from 'react';
import { FileText } from 'lucide-react';
import { occupancyEnd } from '../../functions/lib/crmFinance.mjs';
import { amountFields, downloadLease, leaseDefaults, leaseFields, leaseWarnings } from '../lib/leaseContract.js';

export default function LeaseContractForm({ entry, booking, rooms, account, today, financialReady }) {
  const [startDate, setStart] = useState(booking.checkIn);
  const [endDate, setEnd] = useState(occupancyEnd(booking));
  const [agreementDate, setAgreement] = useState(today);
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const defaults = leaseDefaults({ guest: entry.guest || {}, booking, rooms, account, startDate });
  const values = { ...defaults, ...overrides };
  const warnings = leaseWarnings(booking, startDate, endDate);
  return <form className="crm-panel-section" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await downloadLease(values, { startDate, endDate, agreementDate }); setMessage('Contract generated. Check your browser downloads.'); }
    catch (error) { setMessage(error.message || 'Could not generate the contract. Please try again.'); }
    finally { setBusy(false); }
  }}>
    <h3>Generate lease contract</h3>
    <p className="crm-secondary">Uses the Kolab master lease template. Review PMS details and complete missing fields. Changes here apply only to this contract; signatures remain blank.</p>
    <div className="crm-form-grid">
      <label className="crm-field">Contract start<input required type="date" value={startDate} onChange={(e) => { setStart(e.target.value); setMessage(''); }} /></label>
      <label className="crm-field">Contract end (check-out)<input required type="date" min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} /></label>
      <label className="crm-field">Agreement date<input required type="date" value={agreementDate} onChange={(e) => setAgreement(e.target.value)} /></label>
    </div>
    {warnings.map((warning) => <p className="crm-notice warning" key={warning}>{warning}</p>)}
    {!financialReady && <p className="crm-notice warning">Wait for payment records to sync before generating a contract.</p>}
    <div className="crm-form-grid">{Object.entries(leaseFields).map(([key, label]) => <label className="crm-field" key={key}>{label}<input required type={amountFields.includes(key) || key === 'ROOM_SIZE_SQM' ? 'number' : 'text'} min={key === 'ROOM_SIZE_SQM' ? '0.01' : '0'} step={key === 'ROOM_SIZE_SQM' ? '0.01' : '1'} value={values[key]} placeholder={amountFields.includes(key) ? 'Confirm amount, including 0' : 'Complete missing detail'} onChange={(e) => setOverrides((old) => ({ ...old, [key]: e.target.value }))} /></label>)}</div>
    <p className="crm-secondary">Deposit means the reservation payment toward rent. Payment amounts come from the selected booking’s billing records and must be reviewed, especially for renewals or different dates. Enter “None” for services or notes that do not apply. The bank details and all seven contract sections are retained from the master template.</p>
    <label className="crm-check"><input type="checkbox" required key={JSON.stringify([values, startDate, endDate, agreementDate])} />I reviewed the dates, identity, property details and financial terms.</label>
    <button type="submit" className="crm-button primary" disabled={busy || !financialReady}><FileText size={16} />{busy ? 'Generating…' : 'Download lease PDF'}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
