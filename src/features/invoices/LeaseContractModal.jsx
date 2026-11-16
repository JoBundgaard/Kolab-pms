import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import LeaseContractForm from '../../components/LeaseContractForm.jsx';
import { propertyToday } from '../../../functions/lib/crmFinance.mjs';
import '../../components/GuestCRM.css';

export default function LeaseContractModal({ bookings, guests, rooms, crm, onClose }) {
  const dialog = useRef(null);
  const [bookingId, setBookingId] = useState('');
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  const booking = bookings.find((stay) => stay.id === bookingId);
  const email = (value) => String(value || '').trim().toLowerCase();
  const phone = (value) => String(value || '').replace(/\D/g, '');
  const guest = booking && (guests.find((person) => person.id === booking.guestId)
    || guests.find((person) => (email(booking.guestEmail) && email(person.email) === email(booking.guestEmail))
      || (phone(booking.guestPhone) && phone(person.phone) === phone(booking.guestPhone))));
  return <dialog ref={dialog} className="crm-dialog guest-crm" aria-labelledby="lease-modal-title" onClose={onClose}>
    <div className="crm-panel-header"><div><h2 id="lease-modal-title">Generate lease contract</h2><p>Select a guest booking, then review the dates and contract details.</p></div><button type="button" className="crm-icon-button" aria-label="Close lease contract" onClick={() => dialog.current.close()}><X size={22} /></button></div>
    <label className="crm-field">Select guest / booking<select value={bookingId} onChange={(event) => setBookingId(event.target.value)}><option value="">-- Select a Guest --</option>{bookings.map((stay) => <option value={stay.id} key={stay.id}>{stay.guestName || 'Unknown guest'} — {stay.checkIn} — {rooms.find((room) => room.id === stay.roomId)?.name || stay.roomId}</option>)}</select></label>
    {crm.error && <p className="crm-notice danger" role="alert">{crm.error}</p>}
    {booking ? <LeaseContractForm key={booking.id} entry={{ guest: guest || null }} booking={booking} rooms={rooms} account={crm.accounts.find((account) => account.bookingId === booking.id)} today={propertyToday()} financialReady={!crm.loading && !crm.error} /> : <p className="crm-secondary">Choose a booking to fill the lease from the PMS.</p>}
  </dialog>;
}
