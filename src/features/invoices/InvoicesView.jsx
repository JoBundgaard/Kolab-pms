import { COLORS } from '../../config/pms.js';
import { FileText, Plus } from 'lucide-react';

export default function InvoicesView({
  setIsInvoiceModalOpen,
}) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Invoices</h2>
            <p className="text-slate-500">Create and manage invoices for your guests.</p>
          </div>
          <button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="px-6 py-3 rounded-full flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide"
            style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}
          >
            <Plus size={20} className="mr-2" />
            Create Invoice
          </button>
        </div>

        {/* Placeholder for invoice list - functionality can be expanded later */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-slate-100 mb-4 text-slate-400">
            <FileText size={48} />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">No Invoices Generated Yet</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Use the "Create Invoice" button to generate a PDF invoice for any of your existing bookings.
          </p>
        </div>
      </div>
    );
  }
