import StatCard from '../../components/common/StatCard.jsx';
import { COLORS } from '../../config/pms.js';
import { KOLAB_2025_FINANCIALS, NEIGHBOURS_2025_FINANCIALS, TOWNHOUSE_2025_FINANCIALS } from '../../data/financialBaselines.js';
import { AlertTriangle, BarChart2, Clock, DollarSign, Home, TrendingUp } from 'lucide-react';

export default function StatisticsView({
  customStatsEnd,
  customStatsStart,
  setCustomStatsEnd,
  setCustomStatsStart,
  setStatsRange,
  statsData,
  statsRange,
}) {
    const stats = statsData;
    const maxRevenue = Math.max(...stats.last6Months.map((d) => d.revenue), 1000);
    const channelEntries = Object.entries(stats.channelBreakdown).sort((a, b) => b[1] - a[1]);
    const totalChannels = channelEntries.reduce((sum, [, v]) => sum + v, 0) || 1;
    const stayMixTotal = Object.values(stats.stayMix).reduce((sum, v) => sum + v, 0) || 1;
    const fmtVnd = (val) => `${Math.round(val).toLocaleString('vi-VN')} ₫`;
    const fmtDelta = (pct) => pct === null || pct === undefined ? '–' : `${pct > 0 ? '+' : ''}${pct}%`;

    const rangeTabs = [
      { id: 'this-week', label: 'This week' },
      { id: 'this-month', label: 'This month' },
      { id: 'last-30', label: 'Last 30 days' },
      { id: 'custom', label: 'Custom' },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold mb-1" style={{ color: COLORS.darkGreen }}>Operations & Performance</h2>
            <p className="text-slate-500 text-sm">Range: {stats.rangeLabel} ({stats.rangeStartStr} – {stats.rangeEndStr})</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rangeTabs.map((tab) => {
              const active = statsRange === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatsRange(tab.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${active ? 'bg-[#26402E] text-[#E2F05D] border-[#26402E]' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
                >
                  {tab.label}
                </button>
              );
            })}
            {statsRange === 'custom' && (
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="date"
                  value={customStatsStart}
                  onChange={(e) => setCustomStatsStart(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white shadow-sm"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={customStatsEnd}
                  onChange={(e) => setCustomStatsEnd(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white shadow-sm"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle size={18} className="text-amber-500 mt-1" />
            <div>
              <div className="font-semibold text-slate-800">Actionable insights</div>
              <p className="text-sm text-slate-500">Snapshot of what needs attention right now.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stats.insights.map((msg, idx) => (
              <div key={idx} className="bg-[#F9F8F2] border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">• {msg}</div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Occupancy" value={`${stats.occupancyRate}%`} icon={<Home />} subtext={`Room-nights: ${stats.roomNightsBooked}/${stats.roomNightsAvailable}`} />
          <StatCard title="RevPAR" value={`${Math.round(stats.revPar).toLocaleString('vi-VN')} ₫`} icon={<DollarSign />} subtext="Revenue per available room" />
          <StatCard title="ADR" value={`${Math.round(stats.adr).toLocaleString('vi-VN')} ₫`} icon={<TrendingUp />} subtext="Avg daily rate (stay-weighted)" />
          <StatCard title="Lead time" value={`${stats.avgLeadTime} days`} icon={<Clock />} subtext="Avg booking → check-in" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-lg" style={{ color: COLORS.darkGreen }}>Withholding (Airbnb)</h3>
                <p className="text-xs text-slate-500">Airbnb host fee is calculated from gross. VN VAT and income tax are withheld only for stays before 19 July 2026.</p>
              </div>
              <div className="text-[11px] uppercase font-semibold text-slate-500">Range</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Host Fee</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.range.commission)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">VAT withheld</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.range.vat)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Income tax withheld</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.range.income)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Total withheld</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.range.total)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Coverage</div>
                <div className="font-semibold text-slate-800">{stats.withholding.range.computedCount}/{stats.withholding.range.totalBookings} included</div>
                <div className="text-[11px] text-slate-500">Excluded (missing base): {stats.withholding.range.unknownCount}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-lg" style={{ color: COLORS.darkGreen }}>Withholding YTD (Airbnb)</h3>
                <p className="text-xs text-slate-500">Calendar YTD, based on check-in date.</p>
              </div>
              <div className="text-[11px] uppercase font-semibold text-slate-500">YTD</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Host Fee</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.ytd.commission)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">VAT withheld</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.ytd.vat)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Income tax withheld</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.ytd.income)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Total withheld</div>
                <div className="font-semibold text-slate-800">{fmtVnd(stats.withholding.ytd.total)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 text-xs uppercase">Coverage</div>
                <div className="font-semibold text-slate-800">{stats.withholding.ytd.computedCount}/{stats.withholding.ytd.totalBookings} included</div>
                <div className="text-[11px] text-slate-500">Excluded (missing base): {stats.withholding.ytd.unknownCount}</div>
              </div>
            </div>
          </div>
        </div>

        {stats.withholding.range.byProperty?.length ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-bold text-lg" style={{ color: COLORS.darkGreen }}>Withholding by property (range)</h3>
              <span className="text-[11px] text-slate-500">Airbnb only</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm text-slate-700">
                <thead className="text-xs uppercase text-slate-500 border-b">
                  <tr>
                    <th className="py-2 text-left">Property</th>
                    <th className="py-2 text-right">Host Fee</th>
                    <th className="py-2 text-right">VAT</th>
                    <th className="py-2 text-right">Income</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.withholding.range.byProperty.map((p) => (
                    <tr key={p.property} className="border-b last:border-0">
                      <td className="py-2">{p.property}</td>
                      <td className="py-2 text-right">{fmtVnd(p.commission)}</td>
                      <td className="py-2 text-right">{fmtVnd(p.vat)}</td>
                      <td className="py-2 text-right">{fmtVnd(p.income)}</td>
                      <td className="py-2 text-right font-semibold">{fmtVnd(p.total)}</td>
                      <td className="py-2 text-right text-slate-500">{p.computedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-slate-500">Final earnings used in stats = gross amount − Airbnb host fee − VN VAT − income tax.</div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Operational load</h3>
                <p className="text-sm text-slate-500">Turnovers and friction within the selected range.</p>
              </div>
              <div className="text-xs text-slate-500">Same-day turns: {stats.sameDayTurnovers}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-[#F9F8F2] rounded-xl p-4 border border-slate-200">
                <div className="text-xs uppercase text-slate-500">Peak day</div>
                <div className="text-lg font-bold text-slate-800">{stats.peakTurnover.date}</div>
                <div className="text-sm text-slate-600">{stats.peakTurnover.total} moves ({stats.peakTurnover.checkIns} in / {stats.peakTurnover.checkOuts} out)</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="text-xs uppercase text-slate-500">Avg LOS</div>
                <div className="text-lg font-bold text-slate-800">{stats.avgLengthOfStay} nights</div>
                <div className="text-sm text-slate-600">Shorter stays increase workload</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="text-xs uppercase text-slate-500">Cancellation rate</div>
                <div className="text-lg font-bold text-slate-800">{stats.cancellationRate}%</div>
                <div className="text-sm text-slate-600">Of bookings touching this range</div>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm text-slate-700">
                <thead className="text-xs uppercase text-slate-500 border-b">
                  <tr><th className="py-2 text-left">Date</th><th className="py-2 text-right">Check-ins</th><th className="py-2 text-right">Check-outs</th><th className="py-2 text-right">Total moves</th></tr>
                </thead>
                <tbody>
                  {stats.turnoverDays.map((d) => (
                    <tr key={d.date} className="border-b last:border-0">
                      <td className="py-2">{d.date}</td>
                      <td className="py-2 text-right">{d.checkIns}</td>
                      <td className="py-2 text-right">{d.checkOuts}</td>
                      <td className="py-2 text-right font-semibold">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Property load</h3>
              <p className="text-sm text-slate-500">Occupancy spread by property.</p>
            </div>
            <div className="space-y-4">
              {stats.propertyLoad.map((p) => (
                <div key={p.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-800">{p.name}</span>
                    <span className="text-slate-500">{p.occupancy}% · {p.nights} nights</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p.occupancy}%`, backgroundColor: COLORS.darkGreen }}></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-bold text-slate-800 mb-2">Stay mix</h4>
              <div className="space-y-2">
                {['short', 'medium', 'long'].map((k) => {
                  const val = stats.stayMix[k] || 0;
                  const pct = Math.round((val / stayMixTotal) * 100);
                  const label = k === 'short' ? 'Short' : k === 'medium' ? 'Medium' : 'Long';
                  return (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{label}</span>
                      <span className="font-semibold text-slate-800">{pct}% ({val})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2">
              <BarChart2 size={18} className="text-slate-400" />
              <div>
                <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Recent revenue trend</h3>
                <p className="text-sm text-slate-500">Last 6 months (context, not target-based).</p>
              </div>
            </div>
            <div className="h-56 flex items-end justify-between space-x-4 mt-4">
              {stats.last6Months.map((data, index) => (
                <div key={index} className="flex flex-col items-center flex-1 group">
                  <div className="w-full relative flex flex-col justify-end h-full group-hover:opacity-80 transition-opacity">
                    <div
                      className="w-full rounded-t-lg transition-all duration-500"
                      style={{
                        height: `${(data.revenue / maxRevenue) * 100}%`,
                        backgroundColor: COLORS.darkGreen,
                        opacity: 0.85,
                      }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-slate-500 mt-2">{data.month}</span>
                  <span className="text-xs font-bold text-slate-700 mt-1">{(data.revenue / 1000000).toFixed(1)}M</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Booking behavior</h3>
              <p className="text-sm text-slate-500">Channel mix and lead patterns.</p>
            </div>
            <div className="space-y-3">
              {channelEntries.map(([channel, count]) => {
                const pct = Math.round((count / totalChannels) * 100);
                const label = channel === 'coliving' ? 'Coliving.com' : channel === 'direct' ? 'Direct' : channel;
                return (
                  <div key={channel} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 capitalize">{label}</span>
                    <span className="font-semibold text-slate-800">{pct}% ({count})</span>
                  </div>
                );
              })}
              {!channelEntries.length && <div className="text-sm text-slate-500">No channel data in range.</div>}
            </div>
            <div className="pt-2 border-t">
              <div className="text-xs uppercase text-slate-500">Avg lead time</div>
              <div className="text-lg font-bold text-slate-800">{stats.avgLeadTime} days</div>
              <p className="text-sm text-slate-600">Use for pricing and availability strategy.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Townhouse YoY vs 2025</h3>
              <p className="text-sm text-slate-500">Monthly revenue and occupancy compared to 2025 baseline.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm min-w-[260px]">
              <div className="bg-[#F9F8F2] border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">YTD revenue</div>
                <div className="text-lg font-bold text-slate-800">{fmtVnd(stats.townhouseYoy.ytdRevenueCurrent)}</div>
                <div className="text-xs text-slate-500">vs 2025: {fmtDelta(stats.townhouseYoy.ytdDeltaPct)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">YTD occupancy</div>
                <div className="text-lg font-bold text-slate-800">{stats.townhouseYoy.ytdOccCurrent}%</div>
                <div className="text-xs text-slate-500">2025 avg {stats.townhouseYoy.ytdOccBaseline}%</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">Baseline expenses</div>
                <div className="text-lg font-bold text-slate-800">{fmtVnd(TOWNHOUSE_2025_FINANCIALS.reduce((s, m) => s + m.opex, 0) / 12)}</div>
                <div className="text-xs text-slate-500">2025 average monthly opex (current opex not tracked)</div>
              </div>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm text-slate-700">
              <thead className="text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="py-2 text-left">Month</th>
                  <th className="py-2 text-right">Revenue</th>
                  <th className="py-2 text-right">vs 2025</th>
                  <th className="py-2 text-right">Occ.</th>
                  <th className="py-2 text-right">Occ. 2025</th>
                  <th className="py-2 text-right">ADR</th>
                  <th className="py-2 text-right">ADR 2025</th>
                </tr>
              </thead>
              <tbody>
                {stats.townhouseYoy.months.map((m) => (
                  <tr key={m.monthIdx} className="border-b last:border-0">
                    <td className="py-2">{m.label}</td>
                    <td className="py-2 text-right">{fmtVnd(m.revenueCurrent)}</td>
                    <td className={`py-2 text-right font-semibold ${m.revenueDeltaPct > 0 ? 'text-emerald-600' : m.revenueDeltaPct < 0 ? 'text-red-600' : 'text-slate-600'}`}>{fmtDelta(m.revenueDeltaPct)}</td>
                    <td className="py-2 text-right">{m.occupancyCurrent}%</td>
                    <td className="py-2 text-right text-slate-500">{m.occupancyBaseline ? `${m.occupancyBaseline}%` : '–'}</td>
                    <td className="py-2 text-right">{fmtVnd(m.adrCurrent)}</td>
                    <td className="py-2 text-right text-slate-500">{m.baselineAdr ? fmtVnd(m.baselineAdr) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-slate-500">Notes: VAT included in revenue. Current expenses not tracked in PMS; baseline opex shown for cost-creep awareness. RevPAR/GOPPAR baselines available in source data if needed for deeper margin analysis.</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Kolab (All properties) YoY vs 2025</h3>
              <p className="text-sm text-slate-500">Combined monthly revenue and occupancy vs 2025 baseline.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm min-w-[260px]">
              <div className="bg-[#F9F8F2] border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">YTD revenue</div>
                <div className="text-lg font-bold text-slate-800">{fmtVnd(stats.kolabYoy.ytdRevenueCurrent)}</div>
                <div className="text-xs text-slate-500">vs 2025: {fmtDelta(stats.kolabYoy.ytdDeltaPct)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">YTD occupancy</div>
                <div className="text-lg font-bold text-slate-800">{stats.kolabYoy.ytdOccCurrent}%</div>
                <div className="text-xs text-slate-500">2025 avg {stats.kolabYoy.ytdOccBaseline}%</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">Baseline expenses</div>
                <div className="text-lg font-bold text-slate-800">{fmtVnd(KOLAB_2025_FINANCIALS.reduce((s, m) => s + m.opex, 0) / 12)}</div>
                <div className="text-xs text-slate-500">2025 average monthly opex (current opex not tracked)</div>
              </div>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm text-slate-700">
              <thead className="text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="py-2 text-left">Month</th>
                  <th className="py-2 text-right">Revenue</th>
                  <th className="py-2 text-right">vs 2025</th>
                  <th className="py-2 text-right">Occ.</th>
                  <th className="py-2 text-right">Occ. 2025</th>
                  <th className="py-2 text-right">ADR</th>
                  <th className="py-2 text-right">ADR 2025</th>
                </tr>
              </thead>
              <tbody>
                {stats.kolabYoy.months.map((m) => (
                  <tr key={m.monthIdx} className="border-b last:border-0">
                    <td className="py-2">{m.label}</td>
                    <td className="py-2 text-right">{fmtVnd(m.revenueCurrent)}</td>
                    <td className={`py-2 text-right font-semibold ${m.revenueDeltaPct > 0 ? 'text-emerald-600' : m.revenueDeltaPct < 0 ? 'text-red-600' : 'text-slate-600'}`}>{fmtDelta(m.revenueDeltaPct)}</td>
                    <td className="py-2 text-right">{m.occupancyCurrent}%</td>
                    <td className="py-2 text-right text-slate-500">{m.occupancyBaseline ? `${m.occupancyBaseline}%` : '–'}</td>
                    <td className="py-2 text-right">{fmtVnd(m.adrCurrent)}</td>
                    <td className="py-2 text-right text-slate-500">{m.baselineAdr ? fmtVnd(m.baselineAdr) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-slate-500">Notes: VAT included in revenue. Current expenses not tracked in PMS; baseline opex shown for cost-creep awareness. Combined KPIs help spot portfolio-level seasonality and margin shifts.</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-serif font-bold text-xl" style={{ color: COLORS.darkGreen }}>Neighbours YoY vs 2025</h3>
              <p className="text-sm text-slate-500">Monthly revenue and occupancy compared to 2025 baseline (opening mid-year).</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm min-w-[260px]">
              <div className="bg-[#F9F8F2] border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">YTD revenue</div>
                <div className="text-lg font-bold text-slate-800">{fmtVnd(stats.neighboursYoy.ytdRevenueCurrent)}</div>
                <div className="text-xs text-slate-500">vs 2025: {fmtDelta(stats.neighboursYoy.ytdDeltaPct)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">YTD occupancy</div>
                <div className="text-lg font-bold text-slate-800">{stats.neighboursYoy.ytdOccCurrent}%</div>
                <div className="text-xs text-slate-500">2025 avg {stats.neighboursYoy.ytdOccBaseline || '–'}%</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs uppercase text-slate-500">Baseline expenses</div>
                <div className="text-lg font-bold text-slate-800">{fmtVnd(NEIGHBOURS_2025_FINANCIALS.reduce((s, m) => s + m.opex, 0) / 12)}</div>
                <div className="text-xs text-slate-500">2025 average monthly opex (current opex not tracked)</div>
              </div>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm text-slate-700">
              <thead className="text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="py-2 text-left">Month</th>
                  <th className="py-2 text-right">Revenue</th>
                  <th className="py-2 text-right">vs 2025</th>
                  <th className="py-2 text-right">Occ.</th>
                  <th className="py-2 text-right">Occ. 2025</th>
                  <th className="py-2 text-right">ADR</th>
                  <th className="py-2 text-right">ADR 2025</th>
                </tr>
              </thead>
              <tbody>
                {stats.neighboursYoy.months.map((m) => (
                  <tr key={m.monthIdx} className="border-b last:border-0">
                    <td className="py-2">{m.label}</td>
                    <td className="py-2 text-right">{fmtVnd(m.revenueCurrent)}</td>
                    <td className={`py-2 text-right font-semibold ${m.revenueDeltaPct > 0 ? 'text-emerald-600' : m.revenueDeltaPct < 0 ? 'text-red-600' : 'text-slate-600'}`}>{fmtDelta(m.revenueDeltaPct)}</td>
                    <td className="py-2 text-right">{m.occupancyCurrent}%</td>
                    <td className="py-2 text-right text-slate-500">{m.occupancyBaseline ? `${m.occupancyBaseline}%` : '–'}</td>
                    <td className="py-2 text-right">{fmtVnd(m.adrCurrent)}</td>
                    <td className="py-2 text-right text-slate-500">{m.baselineAdr ? fmtVnd(m.baselineAdr) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-slate-500">Notes: VAT included in revenue. Current expenses not tracked in PMS; baseline opex shown for cost-creep awareness. Early months have no baseline KPIs (property opened mid-year).</div>
        </div>
      </div>
    );
  }
