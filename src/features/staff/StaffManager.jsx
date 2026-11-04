import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, Users } from "lucide-react";
import { ALL_ROOMS, PROPERTIES } from "../../config/properties.js";
import {
  expandBookingToRoomStays,
  isHousekeepingBooking,
} from "../../lib/bookingDates.js";
import { normalizeHousekeepingTasks } from "../../lib/housekeeping.js";
import {
  staffOperation,
  staffRequest,
  runStaffOperation,
} from "../../services/staffService.js";
import {
  staffToday,
  TASK_TYPES,
  weekStart,
  weeklySummary,
} from "../../../functions/lib/staffDomain.mjs";
import StaffPortal, { Feedback, Pay, PurchaseList } from "./StaffPortal.jsx";
import useStaffBoard from "./useStaffBoard.js";
import {
  buttonClass,
  inputClass,
  money,
  propertyName,
  secondaryClass,
  taskLabels,
} from "./staffUi.js";

export default function StaffManager({
  user,
  bookings,
  housekeepingOverrides,
  dataError,
}) {
  const [team, setTeam] = useState([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(""),
    [editor, setEditor] = useState(null),
    [view, setView] = useState("manage");
  const refresh = useCallback(async () => {
    try {
      const data = await staffRequest("team");
      setTeam(data.profiles);
      setLoaded(true);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    staffRequest("team").then(
      (data) => {
        if (alive) {
          setTeam(data.profiles);
          setLoaded(true);
        }
      },
      (err) => {
        if (alive) setError(err.message);
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  const profile = team.find((p) => p.uid === selected) || team[0];
  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#26402E] flex items-center gap-3">
            <Users /> Staff & pay
          </h2>
          <p className="text-slate-500 mt-2">
            Assign the day. Review the work. Keep pay and purchases together.
          </p>
        </div>
        <button
          className={`${buttonClass} flex items-center gap-2`}
          onClick={() => setEditor({})}
        >
          <Plus size={18} /> Add staff member
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-4">
          {error}{" "}
          <button className="underline" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      {!loaded && !error && <p>Loading staff…</p>}
      {loaded && !team.length && (
        <section className="bg-white rounded-3xl border border-dashed p-10 text-center">
          <ClipboardCheck className="mx-auto text-slate-400 mb-4" size={40} />
          <h3 className="text-xl font-semibold text-[#26402E]">
            A simpler workday starts here
          </h3>
          <p className="text-slate-500 mt-2 max-w-lg mx-auto">
            Add her name and Google email, choose her properties, then publish
            her first day. Normal cleans start at 100,000 VND; room checks stay
            off her pay statement.
          </p>
          <button
            className={`${buttonClass} mt-5`}
            onClick={() => setEditor({})}
          >
            Set up your first staff member
          </button>
        </section>
      )}
      {profile && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm flex-1 min-w-48 max-w-sm">
              Staff member
              <select
                className={inputClass}
                value={profile.uid}
                onChange={(e) => setSelected(e.target.value)}
              >
                {team.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.name}
                    {p.active ? "" : " · inactive"}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={secondaryClass}
              onClick={() => setEditor(profile)}
            >
              Profile & rates
            </button>
            <button
              className={secondaryClass}
              onClick={() => setView(view === "manage" ? "preview" : "manage")}
            >
              {view === "manage" ? "Open staff view" : "Back to manager view"}
            </button>
          </div>
          {!profile.active && (
            <p className="p-3 rounded-xl bg-amber-50 text-amber-800">
              Access is disabled. Existing work and purchases remain available
              for review and payment.
            </p>
          )}
          {view === "preview" ? (
            <StaffPortal
              key={profile.uid}
              profile={profile}
              user={user}
              preview
            />
          ) : (
            <ManagerBoard
              key={profile.uid}
              profile={profile}
              bookings={bookings}
              overrides={housekeepingOverrides}
              dataError={dataError}
            />
          )}
        </>
      )}
      {editor && (
        <ProfileForm
          key={editor.uid || "new"}
          profile={editor}
          onClose={() => setEditor(null)}
          onSaved={async (uid) => {
            setSelected(uid);
            setEditor(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function ProfileForm({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    language: "vi",
    propertyIds: ["prop_1", "prop_2", "prop_3"],
    active: true,
    ...profile,
    rates: {
      checkout: 100000,
      weekly: 100000,
      check_room: 0,
      shared: null,
      recurring: null,
      ...profile.rates,
    },
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await runStaffOperation(
        staffOperation("saveProfile", form),
      );
      await onSaved(result.uid);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 flex items-center justify-center">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-profile-title"
        className="bg-white rounded-3xl p-6 w-full max-w-xl max-h-[90vh] overflow-auto"
        onSubmit={save}
      >
        <h2
          id="staff-profile-title"
          className="text-2xl font-serif text-[#26402E]"
        >
          {profile.uid ? "Profile & cleaning rates" : "Add staff member"}
        </h2>
        <fieldset disabled={busy} className="space-y-4 mt-5">
          <label className="block text-sm">
            Name
            <input
              autoFocus
              required
              maxLength={100}
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Google account email
            <input
              required
              type="email"
              readOnly={!!profile.uid}
              maxLength={200}
              className={inputClass}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </label>
          <p className="text-sm text-slate-500">
            She signs in with this Google account at the same PMS address and
            opens her staff workspace automatically.
          </p>
          <label className="block text-sm">
            Default language
            <select
              className={inputClass}
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <fieldset>
            <legend className="text-sm mb-2">Properties</legend>
            <div className="flex flex-wrap gap-4">
              {PROPERTIES.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.propertyIds.includes(p.id)}
                    onChange={(e) =>
                      set(
                        "propertyIds",
                        e.target.checked
                          ? [...form.propertyIds, p.id]
                          : form.propertyIds.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="border-t pt-4">
            <h3 className="font-semibold">Pay per completed clean · VND</h3>
            <p className="text-sm text-slate-500 mt-1">
              Blank means the rate needs setting. Zero means unpaid and is
              omitted from the staff pay statement. New rates apply to newly
              assigned tasks.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {TASK_TYPES.map((type) => (
                <label key={type} className="text-sm">
                  {taskLabels[type][0]}
                  <input
                    type="number"
                    min="0"
                    max="1000000000"
                    step="1"
                    className={inputClass}
                    placeholder="Not set"
                    value={form.rates[type] ?? ""}
                    onChange={(e) =>
                      set("rates", { ...form.rates, [type]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <label className="flex gap-2 items-center text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />{" "}
            Enable staff access
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-3">
            <button type="button" className={secondaryClass} onClick={onClose}>
              Cancel
            </button>
            <button className={buttonClass} type="submit">
              {busy ? "Saving…" : "Save staff member"}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function ManagerBoard({ profile, bookings, overrides, dataError }) {
  const [date, setDate] = useState(staffToday),
    [tab, setTab] = useState("day");
  const [reason, setReason] = useState("");
  const state = useStaffBoard(profile.uid, date),
    { board, run, busy } = state;
  const disabled = busy || !state.online;
  const day = board?.day;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4 items-end">
        <label className="text-sm">
          Work date
          <input
            className={inputClass}
            type="date"
            value={date}
            disabled={busy}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          {[
            ["day", "Day & assignments"],
            ["week", "Week & payments"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? buttonClass : secondaryClass}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={state.refresh}
        >
          Refresh
        </button>
      </div>
      <Feedback state={state} />
      {!board && !state.error && <p>Loading work records…</p>}
      {board && tab === "day" && (
        <>
          <section className="rounded-2xl border bg-white p-5 space-y-4">
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-semibold text-lg">
                {date} · {day?.status || "Not assigned"}
              </h3>
              <strong>{money(day?.amountVnd ?? (day ? null : 0))}</strong>
            </div>
            {day?.tasks.map((task) => (
              <div
                key={task.id}
                className="border-t pt-3 flex justify-between items-start gap-3 text-sm"
              >
                <div>
                  <strong>{task.label}</strong> · {taskLabels[task.type][0]}
                  <p className="text-slate-500 mt-1">
                    {propertyName(task.propertyId)} · {task.status} ·{" "}
                    {task.rateVnd == null
                      ? "Rate not set"
                      : money(task.rateVnd)}
                  </p>
                  {task.recurringTodos?.map((todo) => (
                    <p key={todo.id} className={`text-sm mt-2 ${todo.status === 'done' ? 'text-green-800' : 'text-amber-800'}`}>
                      {todo.status === 'done' ? '✓' : '○'} {todo.description} · {todo.status}
                      {todo.reason ? ` · ${todo.reason}` : ''}
                    </p>
                  ))}
                  {task.reason && (
                    <p className="text-amber-800 mt-2">{task.reason}</p>
                  )}
                </div>
                {day.status === "draft" && task.status === "pending" && (
                  <button
                    disabled={disabled}
                    className="underline min-h-11"
                    onClick={() =>
                      run(
                        staffOperation("removeTask", {
                          uid: profile.uid,
                          date,
                          taskId: task.id,
                          revision: day.revision,
                        }),
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!day?.tasks.length && (
              <p className="text-slate-500">
                Choose rooms from the schedule below to publish her day.
              </p>
            )}
            {day?.note && (
              <p className="bg-slate-50 rounded-xl p-3 text-sm">
                Staff note: {day.note}
              </p>
            )}
            {day?.status === "draft" && (
              <button
                className={secondaryClass}
                disabled={disabled}
                onClick={() =>
                  run(
                    staffOperation("setRates", {
                      uid: profile.uid,
                      date,
                      revision: day.revision,
                    }),
                  )
                }
              >
                Apply current profile rates to this draft
              </button>
            )}
            {day?.status === "submitted" && (
              <div className="border-t pt-4 space-y-3">
                <button
                  className={buttonClass}
                  disabled={disabled || day.amountVnd == null}
                  onClick={() =>
                    run(
                      staffOperation("approveDay", {
                        uid: profile.uid,
                        date,
                        revision: day.revision,
                      }),
                    )
                  }
                >
                  Approve {money(day.amountVnd)} wages
                </button>
                {day.amountVnd == null && (
                  <p className="text-amber-800 text-sm">
                    Set the missing rates in her profile, reopen the day, and
                    apply those rates before resubmitting.
                  </p>
                )}
                <label className="block text-sm">
                  Correction reason
                  <input
                    className={inputClass}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className={secondaryClass}
                  disabled={disabled || !reason.trim()}
                  onClick={() =>
                    run(
                      staffOperation("reopenDay", {
                        uid: profile.uid,
                        date,
                        reason,
                        revision: day.revision,
                      }),
                    )
                  }
                >
                  Reopen for correction
                </button>
              </div>
            )}
            {day?.status === "approved" && (
              <p className="text-sm text-slate-500">
                Approved and recorded in Finance. Record the actual payment in
                Week & payments.
              </p>
            )}
            {day?.paymentDate && (
              <p className="text-sm text-slate-500">
                Paid on {day.paymentDate} · {day.method} · {day.reference}
              </p>
            )}
          </section>
          {(!day || day.status === "draft") && profile.active && (
            <AssignmentForm
              key={date}
              profile={profile}
              date={date}
              day={day}
              bookings={bookings}
              overrides={overrides}
              disabled={disabled}
              dataError={dataError}
              run={run}
            />
          )}
          <PurchaseReview
            board={board}
            run={run}
            disabled={disabled}
            date={date}
          />
        </>
      )}
      {board && tab === "week" && (
        <>
          <PaymentForm
            key={weekStart(date)}
            board={board}
            run={run}
            disabled={disabled}
          />
          <PurchaseReview board={board} run={run} disabled={disabled} />
          <Pay
            board={board}
            date={date}
            setDate={setDate}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}

function AssignmentForm({
  profile,
  date,
  day,
  bookings,
  overrides,
  disabled,
  dataError,
  run,
}) {
  const [selected, setSelected] = useState([]),
    [instructions, setInstructions] = useState("");
  const [custom, setCustom] = useState({
    label: "",
    propertyId: profile.propertyIds[0],
    type: "shared",
  });
  const tasks = useMemo(
    () =>
      normalizeHousekeepingTasks({
        bookings: bookings
          .filter(isHousekeepingBooking)
          .flatMap(expandBookingToRoomStays),
        rooms: ALL_ROOMS,
        targetDate: date,
        overrides,
      }).filter(
        (t) =>
          profile.propertyIds.includes(t.propertyId) && t.status !== "clean",
      ),
    [bookings, date, overrides, profile.propertyIds],
  );
  const available = tasks.filter(
    (task) => !day?.tasks.some((t) => t.id === task.id),
  );
  const publish = async () => {
    const chosen = available
      .filter((task) => selected.includes(task.id))
      .map((task) => ({
        id: task.id,
        label: task.roomLabel,
        roomId: task.roomId,
        propertyId: task.propertyId,
        type: task.type,
        instructions,
        availableAfter:
          task.type === "checkout" ? task.checkOutTime || "12:00" : "",
        dueBy: task.type === "check_room" ? task.checkInTime || "15:00" : "",
      }));
    if (
      await run(
        staffOperation("publish", {
          uid: profile.uid,
          date,
          tasks: chosen,
          revision: day?.revision || 0,
        }),
      )
    ) {
      setSelected([]);
      setInstructions("");
    }
  };
  return (
    <section className="rounded-2xl border bg-white p-5 space-y-4">
      <h3 className="font-semibold text-lg">
        Publish work from the housekeeping schedule
      </h3>
      <p className="text-sm text-slate-500">
        Select the rooms she will clean. Existing completions and assignments
        are preserved. A task cannot be assigned to two staff members.
      </p>
      {dataError && (
        <p className="text-red-700 text-sm">
          Schedule unavailable: {dataError}
        </p>
      )}
      <fieldset disabled={disabled || !!dataError} className="space-y-3">
        {available.map((task) => (
          <label
            key={task.id}
            className="flex gap-3 items-start rounded-xl border p-3"
          >
            <input
              className="mt-1 w-5 h-5 accent-[#26402E]"
              type="checkbox"
              checked={selected.includes(task.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, task.id]
                    : selected.filter((id) => id !== task.id),
                )
              }
            />
            <span className="text-sm">
              <strong>{task.roomLabel}</strong> · {task.propertyName} ·{" "}
              {taskLabels[task.type][0]}
              {task.assignedTo && (
                <span className="block text-slate-500">
                  Schedule assignment: {task.assignedTo}
                </span>
              )}
            </span>
          </label>
        ))}
        {!available.length && (
          <p className="text-sm text-slate-500">
            No uncompleted rooms left to add from this schedule.
          </p>
        )}
        <label className="block text-sm">
          Instructions for selected rooms
          <input
            className={inputClass}
            maxLength={500}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <button
          className={buttonClass}
          disabled={!available.some((task) => selected.includes(task.id))}
          onClick={publish}
        >
          Publish selected rooms
        </button>
      </fieldset>
      <form
        className="border-t pt-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              staffOperation("publish", {
                uid: profile.uid,
                date,
                revision: day?.revision || 0,
                tasks: [
                  {
                    ...custom,
                    id: `shared_${date}_${crypto.randomUUID()}`,
                    instructions: "",
                  },
                ],
              }),
            )
          )
            setCustom({ ...custom, label: "" });
        }}
      >
        <h4 className="font-semibold">Add shared-area or extra cleaning</h4>
        <fieldset disabled={disabled} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Property
              <select
                className={inputClass}
                value={custom.propertyId}
                onChange={(e) =>
                  setCustom({ ...custom, propertyId: e.target.value })
                }
              >
                {profile.propertyIds.map((id) => (
                  <option key={id} value={id}>
                    {propertyName(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Type
              <select
                className={inputClass}
                value={custom.type}
                onChange={(e) => setCustom({ ...custom, type: e.target.value })}
              >
                <option value="shared">Shared-area task</option>
                <option value="recurring">Special cleaning</option>
                <option value="checkout">Normal clean · checkout rate</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Task name
            <input
              required
              maxLength={150}
              placeholder="Kitchen, bathrooms, rubbish, laundry…"
              className={inputClass}
              value={custom.label}
              onChange={(e) => setCustom({ ...custom, label: e.target.value })}
            />
          </label>
          <button className={secondaryClass} type="submit">
            Add task to her day
          </button>
        </fieldset>
      </form>
    </section>
  );
}

function PurchaseReview({ board, run, disabled, date }) {
  const [reasons, setReasons] = useState({});
  const pending = board.purchases.filter(
    (p) => p.status === "submitted" && (!date || p.date === date),
  );
  return (
    <section className="rounded-2xl bg-white border p-5 space-y-4">
      <h3 className="font-semibold text-lg">
        Purchase approvals {date ? "· this day" : "· this week"}
      </h3>
      {!pending.length && (
        <p className="text-sm text-slate-500">
          No purchases awaiting approval.
        </p>
      )}
      {pending.map((p) => (
        <div key={p.id} className="space-y-3 border-t pt-4">
          <PurchaseList purchases={[p]} />
          <div className="flex flex-wrap gap-3">
            <button
              disabled={disabled}
              className={buttonClass}
              onClick={() =>
                run(
                  staffOperation("reviewPurchase", {
                    uid: board.profile.uid,
                    purchaseId: p.id,
                    status: "approved",
                  }),
                )
              }
            >
              Approve {money(p.amountVnd)}
            </button>
          </div>
          <label className="block text-sm">
            Reason if rejected
            <input
              className={inputClass}
              maxLength={500}
              value={reasons[p.id] || ""}
              onChange={(e) =>
                setReasons({ ...reasons, [p.id]: e.target.value })
              }
            />
          </label>
          <button
            disabled={disabled || !reasons[p.id]?.trim()}
            className={secondaryClass}
            onClick={() =>
              run(
                staffOperation("reviewPurchase", {
                  uid: board.profile.uid,
                  purchaseId: p.id,
                  status: "rejected",
                  reason: reasons[p.id],
                }),
              )
            }
          >
            Reject with explanation
          </button>
        </div>
      ))}
    </section>
  );
}

function PaymentForm({ board, run, disabled }) {
  const [form, setForm] = useState({
    paymentDate: staffToday(),
    method: "",
    reference: "",
  });
  const [confirm, setConfirm] = useState(false);
  const records = [
    ...board.days
      .filter((d) => d.status === "approved")
      .map((d) => ({ kind: "day", id: d.id })),
    ...board.purchases
      .filter((p) => p.status === "approved" && p.paidWith === "personal")
      .map((p) => ({ kind: "purchase", id: p.id })),
  ];
  const summary = weeklySummary(board.days, board.purchases),
    total = summary.approvedWagesVnd + summary.approvedReimbursementsVnd;
  return (
    <form
      className="rounded-2xl bg-white border p-5 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await run(
            staffOperation("pay", { ...form, uid: board.profile.uid, records }),
          )
        )
          setConfirm(false);
      }}
    >
      <h3 className="font-semibold text-lg">
        Record this week’s approved payment
      </h3>
      <p className="text-sm text-slate-500">
        Records money you have already paid. Wages and personal-purchase
        reimbursements are settled together; no bank transfer is initiated.
      </p>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt>Approved wages</dt>
          <dd>{money(summary.approvedWagesVnd)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Approved reimbursements</dt>
          <dd>{money(summary.approvedReimbursementsVnd)}</dd>
        </div>
        <div className="flex justify-between font-semibold border-t pt-2">
          <dt>Total to record</dt>
          <dd>{money(total)}</dd>
        </div>
      </dl>
      <fieldset
        disabled={disabled || !records.length}
        className="space-y-3 disabled:opacity-40"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Actual payment date
            <input
              required
              type="date"
              max={staffToday()}
              className={inputClass}
              value={form.paymentDate}
              onChange={(e) =>
                setForm({ ...form, paymentDate: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Method / account
            <input
              required
              maxLength={120}
              placeholder="Cash / bank transfer"
              className={inputClass}
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            />
          </label>
        </div>
        <label className="block text-sm">
          Reference (optional)
          <input
            className={inputClass}
            maxLength={200}
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            required
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          I have paid {money(total)} to {board.profile.name} for these{" "}
          {records.length} approved records.
        </label>
        <button type="submit" className={buttonClass} disabled={!confirm}>
          Record payment
        </button>
      </fieldset>
    </form>
  );
}
