import { COLORS } from '../../config/pms.js';
import { BarChart2, Bed, Calendar, FileText, Home, Users, Wrench, X } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={20} /> },
    { id: 'bookings', label: 'Bookings List', icon: <Users size={20} /> },
    { id: 'crm', label: 'Guests & CRM', icon: <Users size={20} /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart2 size={20} /> },
    { id: 'invoices', label: 'Invoices', icon: <FileText size={20} /> },
    { id: 'housekeeping', label: 'Housekeeping', icon: <Bed size={20} /> },
    { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={20} /> },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 text-white transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}
        style={{ backgroundColor: COLORS.darkGreen }}
      >
        <div className="flex items-center justify-between h-20 px-6">
          <div className="flex flex-col">
            <span className="text-2xl font-serif font-bold tracking-wide" style={{ color: COLORS.lime }}>Kolab</span>
            <span className="text-xs uppercase tracking-[0.2em] text-white opacity-80">Living PMS</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white">
            <X size={24} />
          </button>
        </div>
        <nav className="mt-8 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsOpen(false);
              }}
              className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === item.id
                  ? 'text-slate-900 shadow-md translate-x-1'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              style={{
                backgroundColor: activeTab === item.id ? COLORS.lime : 'transparent',
                color: activeTab === item.id ? COLORS.darkGreen : undefined
              }}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full p-6 border-t border-white/10">
          <div className="flex items-center text-slate-300 text-xs font-serif italic">
            "Call Us Your Home"
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
