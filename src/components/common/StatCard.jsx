import { COLORS } from '../../config/pms.js';
import React from 'react';

const StatCard = ({ title, value, icon, subtext, colorClass = 'bg-emerald-500' }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-6 flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</p>
      <h3 className="text-3xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>{value}</h3>
      {subtext && <p className="text-xs text-slate-500 mt-2 font-medium">{subtext}</p>}
    </div>
    <div
      className="p-3 rounded-full"
      style={{ backgroundColor: `${COLORS.lime}40`, color: COLORS.darkGreen }}
    >
      {icon && React.cloneElement(icon, { size: 24 })}
    </div>
  </div>
);

export default StatCard;
