import { COLORS, STAFF } from '../../config/pms.js';
import { ALL_LOCATIONS, PROPERTIES } from '../../config/properties.js';
import { db } from '../../firebase.js';
import { formatDate } from '../../lib/dates.js';
import { computeDuplicateIssues, getFrequencyLabel, severityMeta } from '../../lib/maintenance.js';
import { doc, setDoc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, ListChecks, Plus, RefreshCcw, X } from 'lucide-react';

export default function MaintenanceView({
  activeIssue,
  advanceRecurringTaskForResolvedIssue,
  assignedLabel,
  bulkAssignValue,
  expandedRecurringGroups,
  formatIssueAge,
  groupedRecurringTasks,
  handleBulkAssignIssues,
  handleBulkDeleteIssues,
  handleBulkDeleteRecurringGroup,
  handleBulkResolveIssues,
  handleCleanupDuplicateIssues,
  handleDeleteRecurringTask,
  handleUndo,
  isResolvedStatus,
  issueFilters,
  loadingRecurring,
  maintenanceIssues,
  openIssuePanel,
  openRoomPanel,
  pushAlert,
  selectedIssues,
  setActiveIssue,
  setBulkAssignValue,
  setEditingMaintenanceIssue,
  setEditingRecurringTask,
  setExpandedRecurringGroups,
  setIsMaintenanceModalOpen,
  setIsRecurringModalOpen,
  setIssueFilters,
  setMaintenanceIssues,
  setPendingMaintenancePrefill,
  setPendingRecurringPrefill,
  setRecurringModalMode,
  setSelectedIssues,
  startUndo,
  undoAction,
}) {
    const openIssues = maintenanceIssues.filter((i) => !isResolvedStatus(i.status));
    const severityOrder = { critical: 0, normal: 1, low: 2 };
    const todayStr = formatDate(new Date());

    const filteredIssues = maintenanceIssues.filter((issue) => {
      const location = ALL_LOCATIONS.find((l) => l.id === issue.locationId);
      const propertyId = location?.propertyId;
      const dateStr = formatDate(issue.reportedAt || issue.createdAt);

      if (issueFilters.status === 'open' && isResolvedStatus(issue.status)) return false;
      if (issueFilters.status === 'closed' && !isResolvedStatus(issue.status)) return false;

      if (issueFilters.property !== 'all' && propertyId !== issueFilters.property) return false;

      if (issueFilters.recurringOnly && !(issue.recurringTaskId || issue.templateId || issue.isRecurring)) return false;

      if (issueFilters.dateRange === 'today' && dateStr !== todayStr) return false;
      if (issueFilters.dateRange === 'last7') {
        const diffDays = Math.floor((new Date(todayStr) - new Date(dateStr)) / (1000 * 60 * 60 * 24));
        if (isNaN(diffDays) || diffDays < 0 || diffDays > 7) return false;
      }

      if (issueFilters.search) {
        const text = `${issue.description || ''} ${location?.name || ''} ${location?.propertyName || ''}`.toLowerCase();
        if (!text.includes(issueFilters.search.toLowerCase())) return false;
      }

      return true;
    });

    const sortedActiveIssues = [...filteredIssues].sort((a, b) => {
      const sa = severityOrder[a.severity || 'normal'];
      const sb = severityOrder[b.severity || 'normal'];
      if (sa !== sb) return sa - sb;
      const ageA = new Date(a.reportedAt || a.createdAt || 0).getTime();
      const ageB = new Date(b.reportedAt || b.createdAt || 0).getTime();
      return ageA - ageB; // oldest first
    });

    const allFilteredSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selectedIssues.includes(i.id));
    const duplicateCandidates = computeDuplicateIssues(filteredIssues);

    const criticalIssues = openIssues.filter((i) => (i.severity || 'normal') === 'critical');
    const overdueRecurring = groupedRecurringTasks.reduce((sum, g) => sum + g.overdueCount, 0);

    const statusLabel = (status) => {
      if (status === 'in-progress') return 'In progress';
      if (status === 'waiting') return 'Waiting';
      if (status === 'resolved') return 'Resolved';
      return 'Open';
    };

    const updateIssue = async (issueId, updates, successMessage, undoPayload) => {
      const previousIssue = maintenanceIssues.find((i) => i.id === issueId);
      try {
        await setDoc(doc(db, 'maintenance', issueId), { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
        setMaintenanceIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updates } : i)));
        setActiveIssue((prev) => (prev && prev.id === issueId ? { ...prev, ...updates } : prev));
        const isResolvingNow = isResolvedStatus(updates.status) && !isResolvedStatus(previousIssue?.status);
        if (isResolvingNow) {
          try {
            const resolvedAtIso = updates.resolvedAt || new Date().toISOString();
            await advanceRecurringTaskForResolvedIssue({ ...previousIssue, ...updates }, resolvedAtIso);
          } catch (renewError) {
            console.error('Recurring auto-renew failed while resolving issue', issueId, renewError);
            pushAlert({ title: 'Issue resolved, schedule update failed', message: 'Recurring next due date could not be advanced.', tone: 'error' });
          }
        }
        if (successMessage) pushAlert({ title: successMessage, tone: 'success' });
        if (undoPayload) startUndo(undoPayload);
        return true;
      } catch (error) {
        pushAlert({ title: 'Update failed', message: error?.message || 'Unable to update issue', code: error?.code, raw: error });
        return false;
      }
    };

    const resolveIssue = (issue) => {
      if (!issue) return;
      updateIssue(issue.id, { status: 'resolved', resolvedAt: new Date().toISOString() }, 'Issue resolved', { type: 'resolve', issue: { ...issue } });
    };

    const assignIssue = (issue, staff) => {
      if (!issue) return;
      updateIssue(issue.id, { assignedStaff: staff || 'Needs assignment' }, 'Assignment updated');
    };

    const statusBadgeClass = (status) => {
      if (status === 'in-progress') return 'bg-blue-50 text-blue-700 border-blue-200';
      if (status === 'waiting') return 'bg-amber-50 text-amber-700 border-amber-200';
      if (status === 'resolved') return 'bg-green-50 text-green-700 border-green-200';
      return 'bg-red-50 text-red-700 border-red-200';
    };

    const roomsForProp = (prop) => {
      const propLocations = ALL_LOCATIONS.filter((loc) => loc.propertyId === prop.id);
      return [...propLocations].sort((a, b) => {
        const aIssues = maintenanceIssues.filter((i) => i.locationId === a.id && !isResolvedStatus(i.status));
        const bIssues = maintenanceIssues.filter((i) => i.locationId === b.id && !isResolvedStatus(i.status));
        if (aIssues.length && !bIssues.length) return -1;
        if (bIssues.length && !aIssues.length) return 1;
        if (!aIssues.length && !bIssues.length) return a.name.localeCompare(b.name);
        const aTop = aIssues.sort((x, y) => {
          const sx = severityOrder[x.severity || 'normal'];
          const sy = severityOrder[y.severity || 'normal'];
          if (sx !== sy) return sx - sy;
          return new Date(x.reportedAt || x.createdAt || 0) - new Date(y.reportedAt || y.createdAt || 0);
        })[0];
        const bTop = bIssues.sort((x, y) => {
          const sx = severityOrder[x.severity || 'normal'];
          const sy = severityOrder[y.severity || 'normal'];
          if (sx !== sy) return sx - sy;
          return new Date(x.reportedAt || x.createdAt || 0) - new Date(y.reportedAt || y.createdAt || 0);
        })[0];
        const sa = severityOrder[aTop.severity || 'normal'];
        const sb = severityOrder[bTop.severity || 'normal'];
        if (sa !== sb) return sa - sb;
        return new Date(aTop.reportedAt || aTop.createdAt || 0) - new Date(bTop.reportedAt || bTop.createdAt || 0);
      });
    };

    const oldestAgeLabel = (issues) => {
      if (!issues.length) return '–';
      const oldest = issues.reduce((prev, cur) => {
        const prevTime = new Date(prev.reportedAt || prev.createdAt || 0).getTime();
        const curTime = new Date(cur.reportedAt || cur.createdAt || 0).getTime();
        return curTime < prevTime ? cur : prev;
      }, issues[0]);
      return formatIssueAge(oldest.reportedAt || oldest.createdAt);
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Maintenance Tracking</h2>
            <p className="text-slate-500">Command center for issues, rooms, and recurring tasks.</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => { setEditingMaintenanceIssue(null); setIsMaintenanceModalOpen(true); }}
              className="px-5 py-3 rounded-full flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide"
              style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}
            >
              <ListChecks size={18} className="mr-2" />
              Report Issue
            </button>
            <button
              onClick={() => { setRecurringModalMode('single'); setEditingRecurringTask(null); setPendingRecurringPrefill(null); setIsRecurringModalOpen(true); }}
              className="px-4 py-3 rounded-full flex items-center shadow-md hover:shadow-lg transition-all font-bold text-xs uppercase tracking-wide"
              style={{ backgroundColor: COLORS.lime, color: COLORS.darkGreen }}
            >
              <RefreshCcw size={16} className="mr-2" />
              Recurring
            </button>
            <button
              onClick={() => { setRecurringModalMode('multiple'); setEditingRecurringTask(null); setPendingRecurringPrefill(null); setIsRecurringModalOpen(true); }}
              className="px-4 py-3 rounded-full flex items-center shadow-md hover:shadow-lg transition-all font-bold text-[11px] uppercase tracking-wide"
              style={{ backgroundColor: COLORS.white, color: COLORS.darkGreen, border: '1px solid #E5E7EB' }}
            >
              <RefreshCcw size={16} className="mr-2" />
              Recurring (Bulk)
            </button>
          </div>
        </div>

        {/* Today focus */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'Open issues', value: openIssues.length, color: 'bg-white', text: 'text-slate-700' },
            { label: 'Critical', value: criticalIssues.length, color: 'bg-red-50', text: 'text-red-700' },
            { label: 'Overdue recurring', value: overdueRecurring, color: 'bg-amber-50', text: 'text-amber-800' },
          ].map((item) => (
            <div key={item.label} className={`flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 shadow-sm ${item.color}`}>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</div>
              <div className={`text-xl font-semibold ${item.text}`}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Active issues command center */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-500" />
              <div>
                <h3 className="font-bold text-lg text-slate-800">Active Issues</h3>
                <p className="text-xs text-slate-500">Filter, select, and bulk act. Sorted by severity then oldest.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600">{openIssues.length} open</span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600">{filteredIssues.length} shown</span>
            </div>
          </div>

          <div className="px-6 py-3 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              value={issueFilters.status}
              onChange={(e) => { setIssueFilters((prev) => ({ ...prev, status: e.target.value })); setSelectedIssues([]); }}
            >
              <option value="open">Status: Open</option>
              <option value="closed">Status: Closed</option>
              <option value="all">Status: All</option>
            </select>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              value={issueFilters.property}
              onChange={(e) => { setIssueFilters((prev) => ({ ...prev, property: e.target.value })); setSelectedIssues([]); }}
            >
              <option value="all">All properties</option>
              {PROPERTIES.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              value={issueFilters.dateRange}
              onChange={(e) => { setIssueFilters((prev) => ({ ...prev, dateRange: e.target.value })); setSelectedIssues([]); }}
            >
              <option value="all">Any date</option>
              <option value="today">Created today</option>
              <option value="last7">Last 7 days</option>
            </select>
            <label className="inline-flex items-center gap-2 text-slate-600 text-sm">
              <input
                type="checkbox"
                className="accent-[#26402E]"
                checked={issueFilters.recurringOnly}
                onChange={(e) => { setIssueFilters((prev) => ({ ...prev, recurringOnly: e.target.checked })); setSelectedIssues([]); }}
              />
              Only recurring-generated
            </label>
            <input
              type="text"
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              placeholder="Search description or room"
              value={issueFilters.search}
              onChange={(e) => { setIssueFilters((prev) => ({ ...prev, search: e.target.value })); setSelectedIssues([]); }}
            />
          </div>

          <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-slate-100 bg-slate-50">
            <div className="text-sm text-slate-700 font-semibold">Selected: {selectedIssues.length}</div>
            <button
              onClick={() => {
                if (allFilteredSelected) {
                  setSelectedIssues((prev) => prev.filter((id) => !filteredIssues.some((i) => i.id === id)));
                } else {
                  setSelectedIssues(Array.from(new Set([...selectedIssues, ...filteredIssues.map((i) => i.id)])));
                }
              }}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              {allFilteredSelected ? 'Clear selection' : 'Select all filtered'}
            </button>
            <button
              disabled={selectedIssues.length === 0}
              onClick={() => handleBulkDeleteIssues(selectedIssues)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${selectedIssues.length ? 'border-red-200 text-red-700 bg-white hover:bg-red-50' : 'border-slate-200 text-slate-400 bg-white cursor-not-allowed'}`}
            >
              Delete selected
            </button>
            <button
              disabled={selectedIssues.length === 0}
              onClick={() => handleBulkResolveIssues(selectedIssues)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${selectedIssues.length ? 'border-green-200 text-green-700 bg-white hover:bg-green-50' : 'border-slate-200 text-slate-400 bg-white cursor-not-allowed'}`}
            >
              Close selected
            </button>
            <div className="flex items-center gap-2 text-xs">
              <select
                className="border border-slate-200 rounded-full px-3 py-1.5 bg-white text-slate-700"
                value={bulkAssignValue}
                onChange={(e) => setBulkAssignValue(e.target.value)}
              >
                <option value="Needs assignment">Needs assignment</option>
                {STAFF.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                disabled={selectedIssues.length === 0}
                onClick={() => handleBulkAssignIssues(selectedIssues, bulkAssignValue)}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${selectedIssues.length ? 'border-slate-200 text-slate-700 bg-white hover:bg-slate-100' : 'border-slate-200 text-slate-400 bg-white cursor-not-allowed'}`}
              >
                Assign selected
              </button>
            </div>
            <button
              onClick={() => handleCleanupDuplicateIssues(filteredIssues)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${duplicateCandidates.length ? 'border-amber-200 text-amber-800 bg-white hover:bg-amber-50' : 'border-slate-200 text-slate-400 bg-white cursor-not-allowed'}`}
              disabled={duplicateCandidates.length === 0}
            >
              Clean up duplicates {duplicateCandidates.length ? `(${duplicateCandidates.length})` : ''}
            </button>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <CheckCircle size={48} className="mx-auto mb-3 text-green-500 opacity-60" />
              <p>No issues match this view.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        className="accent-[#26402E]"
                        checked={allFilteredSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIssues(Array.from(new Set([...selectedIssues, ...filteredIssues.map((i) => i.id)])));
                          } else {
                            setSelectedIssues((prev) => prev.filter((id) => !filteredIssues.some((i) => i.id === id)));
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3">Severity</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3">Status · Age</th>
                    <th className="px-6 py-3">Assigned</th>
                    <th className="px-6 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedActiveIssues.map((issue) => {
                    const location = ALL_LOCATIONS.find((l) => l.id === issue.locationId);
                    const sev = severityMeta(issue.severity);
                    const isSelected = selectedIssues.includes(issue.id);
                    return (
                      <tr key={issue.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="accent-[#26402E]"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedIssues((prev) => prev.includes(issue.id) ? prev.filter((id) => id !== issue.id) : [...prev, issue.id]);
                            }}
                          />
                        </td>
                        <td className="px-6 py-3" onClick={() => openIssuePanel(issue)}>
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${sev.bg} ${sev.color} border-current gap-2`}>
                            <span className={`w-2 h-2 rounded-full ${sev.dot}`}></span>
                            {sev.label}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-700" onClick={() => openIssuePanel(issue)}>
                          <div className="font-semibold">{location?.name || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">{location?.propertyName}</div>
                        </td>
                        <td className="px-6 py-3 text-sm" onClick={() => openIssuePanel(issue)}>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadgeClass(issue.status)}`}>{statusLabel(issue.status)}</span>
                          <div className="text-xs text-slate-500 mt-1">{formatIssueAge(issue.reportedAt || issue.createdAt)}</div>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-700" onClick={() => openIssuePanel(issue)}>
                          {assignedLabel(issue.assignedStaff)}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate" title={issue.description} onClick={() => openIssuePanel(issue)}>{issue.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rooms & Areas */}
        <div className="space-y-4">
          {PROPERTIES.map((prop) => {
            const propLocations = roomsForProp(prop);
            const propIssues = openIssues.filter((i) => i.propertyName === prop.name || ALL_LOCATIONS.find((l) => l.id === i.locationId)?.propertyId === prop.id);
            const oldestAge = oldestAgeLabel(propIssues);
            const topSeverity = propIssues.length ? severityMeta(propIssues.sort((a, b) => severityOrder[a.severity || 'normal'] - severityOrder[b.severity || 'normal'])[0].severity).dot : 'bg-green-400';
            const statusDot = propIssues.length ? (topSeverity.includes('red') ? 'bg-red-500' : 'bg-amber-500') : 'bg-green-500';
            return (
              <div key={prop.id} className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}>
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusDot} border border-white/40`}></span>
                    <div>
                      <div className="font-bold text-lg">{prop.name}</div>
                      <div className="text-xs text-white/80">{propIssues.length} open · oldest {oldestAge}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingMaintenanceIssue({ locationId: propLocations[0]?.id }); setIsMaintenanceModalOpen(true); }}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white hover:bg-white/30"
                  >
                    + Quick add
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {propLocations.map((loc) => {
                    const locIssues = maintenanceIssues.filter((i) => i.locationId === loc.id && !isResolvedStatus(i.status));
                    const hasIssue = locIssues.length > 0;
                    const top = hasIssue ? locIssues.sort((a, b) => severityOrder[a.severity || 'normal'] - severityOrder[b.severity || 'normal'])[0] : null;
                    const emphasis = hasIssue ? 'bg-red-50 border-red-100' : 'bg-white';
                    return (
                      <button
                        key={loc.id}
                        onClick={() => openRoomPanel(loc.id, 'room')}
                        className={`text-left p-4 flex justify-between items-center hover:bg-[#F9F8F2] transition-colors ${emphasis}`}
                      >
                        <div>
                          <div className={`font-bold ${hasIssue ? 'text-red-800' : 'text-slate-700'}`}>{loc.name}</div>
                          <div className="text-xs text-slate-500">{loc.locationType}</div>
                          {hasIssue && (
                            <div className="mt-2 text-xs text-red-700 flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${severityMeta(top?.severity).dot}`}></span>
                              {locIssues.length} issue{locIssues.length > 1 ? 's' : ''} · {formatIssueAge(top?.reportedAt || top?.createdAt)} old
                            </div>
                          )}
                          {!hasIssue && <div className="text-[11px] text-slate-400 mt-2">All clear</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasIssue && (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white border border-red-200 text-red-700">
                              View / Edit
                            </span>
                          )}
                          <Plus
                            size={16}
                            className="text-slate-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomPanel(loc.id, 'room-create');
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Recurring tasks command center */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCcw size={18} className="text-slate-500" />
              <div>
                <div className="font-bold text-slate-800">Recurring Tasks</div>
                <div className="text-xs text-slate-500">Grouped by task · expand for room detail</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {loadingRecurring ? (
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Loading…</span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{groupedRecurringTasks.length} group{groupedRecurringTasks.length === 1 ? '' : 's'}</span>
              )}
            </div>
          </div>
          {loadingRecurring ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><RefreshCcw size={16} className="animate-spin text-slate-400" /> Loading recurring tasks…</div>
          ) : groupedRecurringTasks.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No recurring tasks yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedRecurringTasks.map((group) => {
                const expanded = !!expandedRecurringGroups[group.key];
                return (
                  <div key={group.key} className="hover:bg-slate-50/50 transition-colors">
                    <div className="px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3 md:items-center">
                        <button
                          type="button"
                          onClick={() => setExpandedRecurringGroups((prev) => ({ ...prev, [group.key]: !expanded }))}
                          className="mt-1 md:mt-0 text-slate-500 hover:text-slate-700 focus:outline-none"
                          aria-label={expanded ? 'Collapse' : 'Expand'}
                        >
                          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <div>
                          <div className="font-semibold text-slate-800">{group.description}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-3 mt-1">
                            <span className="uppercase tracking-wide font-semibold text-[11px]">{getFrequencyLabel(group.frequency)}</span>
                            <span>Applies to {group.roomCount} room{group.roomCount === 1 ? '' : 's'}</span>
                            {group.nextDue && <span className="text-slate-600">Next due {group.nextDue}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {group.overdueCount > 0 && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                            {group.overdueCount} overdue
                          </span>
                        )}
                        {group.dueSoonCount > 0 && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {group.dueSoonCount} due soon
                          </span>
                        )}
                        <button
                          onClick={() => { setRecurringModalMode('single'); setEditingRecurringTask(group.tasks[0]); setPendingRecurringPrefill(null); setIsRecurringModalOpen(true); }}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setRecurringModalMode('single');
                            setEditingRecurringTask(null);
                            setPendingRecurringPrefill({
                              description: group.description,
                              frequency: group.frequency,
                              nextDue: group.nextDue || formatDate(new Date()),
                            });
                            setIsRecurringModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50"
                        >
                          Add room
                        </button>
                        <button
                          onClick={() => handleBulkDeleteRecurringGroup(group.key)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-red-200 text-red-700 bg-white hover:bg-red-50"
                        >
                          Delete all
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50">
                        <div className="px-6 py-2 text-[11px] uppercase tracking-wide text-slate-500 grid grid-cols-2 md:grid-cols-5 gap-2">
                          <div>Room</div>
                          <div>Last done</div>
                          <div>Next due</div>
                          <div>Status</div>
                          <div className="text-right">Actions</div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {group.tasks.map((task) => (
                            <div key={task.id} className="px-6 py-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-center text-sm text-slate-700">
                              <div>
                                <div className="font-semibold">{task.locationName}</div>
                                <div className="text-xs text-slate-500">{task.propertyName}</div>
                              </div>
                              <div className="text-slate-600">{task.lastDone ? (formatDate(task.lastDone) || task.lastDone) : 'Never'}</div>
                              <div className="text-slate-600">{task.nextDue || '—'}</div>
                              <div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${task.statusMeta.color}`}>
                                  {task.statusMeta.label}
                                </span>
                              </div>
                              <div className="flex justify-end gap-2 text-xs">
                                <button
                                  onClick={() => { setRecurringModalMode('single'); setEditingRecurringTask(task); setPendingRecurringPrefill(null); setIsRecurringModalOpen(true); }}
                                  className="px-3 py-1 rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-100"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteRecurringTask(task.id, { roomName: task.locationName })}
                                  className="px-3 py-1 rounded-full border border-red-200 text-red-700 bg-white hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {activeIssue && (
          <div className="fixed inset-0 z-40 flex">
            <div className="flex-1 bg-slate-900/30" onClick={() => setActiveIssue(null)}></div>
            <div className="w-full max-w-md bg-white shadow-2xl border-l border-slate-100 p-6 overflow-y-auto">
              {activeIssue.panelType === 'room' || activeIssue.panelType === 'room-create' ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-slate-500">Room</div>
                      <h4 className="font-bold text-xl text-slate-800">{activeIssue.locationName}</h4>
                      <div className="text-sm text-slate-500 mt-1">{activeIssue.propertyName}</div>
                    </div>
                    <button onClick={() => setActiveIssue(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                  </div>

                  {activeIssue.issues && activeIssue.issues.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Issues for this room</div>
                      <div className="space-y-2">
                        {activeIssue.issues.map((iss) => (
                          <button
                            key={iss.id}
                            onClick={() => openIssuePanel(iss)}
                            className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-slate-800">{iss.description}</div>
                              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusBadgeClass(iss.status)}`}>{statusLabel(iss.status)}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${severityMeta(iss.severity).dot}`}></span>
                              {formatIssueAge(iss.reportedAt || iss.createdAt)} old
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No issues for this room.</div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Actions</div>
                    <button
                      onClick={() => {
                        setEditingMaintenanceIssue({ locationId: activeIssue.locationId, status: 'open', assignedStaff: 'Needs assignment', severity: 'normal' });
                        setPendingMaintenancePrefill({ locationId: activeIssue.locationId });
                        setIsMaintenanceModalOpen(true);
                        setActiveIssue(null);
                      }}
                      className="w-full px-4 py-3 rounded-xl text-sm font-bold bg-[#E2F05D] text-[#26402E] hover:bg-[#d6e34f] border border-[#d6e34f]"
                    >
                      Report new issue
                    </button>
                    {activeIssue.issues && activeIssue.issues.length > 0 && (
                      <div className="text-xs text-slate-500">Tap any issue above to view/edit.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-xs text-slate-500">Issue · {formatIssueAge(activeIssue.reportedAt || activeIssue.createdAt)} old</div>
                      <h4 className="font-bold text-xl text-slate-800">{activeIssue.description}</h4>
                      <div className="text-sm text-slate-500 mt-1">{activeIssue.propertyName} · {activeIssue.locationName}</div>
                    </div>
                    <button onClick={() => setActiveIssue(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${severityMeta(activeIssue.severity).bg} ${severityMeta(activeIssue.severity).color} border-current flex items-center gap-2`}>
                        <span className={`w-2 h-2 rounded-full ${severityMeta(activeIssue.severity).dot}`}></span>
                        {severityMeta(activeIssue.severity).label}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusBadgeClass(activeIssue.status)}`}>{statusLabel(activeIssue.status)}</span>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                      <select
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
                        value={activeIssue.status}
                        onChange={(e) => updateIssue(activeIssue.id, { status: e.target.value })}
                      >
                        <option value="open">Open</option>
                        <option value="in-progress">In progress</option>
                        <option value="waiting">Waiting</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned</label>
                      <select
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
                        value={assignedLabel(activeIssue.assignedStaff)}
                        onChange={(e) => assignIssue(activeIssue, e.target.value)}
                      >
                        <option value="Needs assignment">Needs assignment</option>
                        {STAFF.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Created</label>
                      <div className="text-sm text-slate-600 mt-1">{new Date(activeIssue.reportedAt || activeIssue.createdAt).toLocaleString()} ({formatIssueAge(activeIssue.reportedAt || activeIssue.createdAt)} old)</div>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => resolveIssue(activeIssue)} className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">Mark resolved</button>
                      <button onClick={() => setActiveIssue(null)} className="px-4 py-3 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 border border-slate-200">Close</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {undoAction && (
          <div className="fixed bottom-4 left-4 z-50">
            <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-full shadow-lg">
              <span className="text-sm font-semibold">Undo {undoAction.type === 'delete' ? 'delete' : 'resolve'}?</span>
              <button onClick={handleUndo} className="px-3 py-1 rounded-full bg-white text-slate-900 text-xs font-bold">Undo</button>
            </div>
          </div>
        )}
      </div>
    );
  }
