import { useState } from "react";
import { signOut } from "firebase/auth";
import {
  Check,
  ClipboardList,
  LogOut,
  Receipt,
  Wallet,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { auth } from "../../firebase.js";
import {
  addStaffDays,
  dayEarnings,
  staffToday,
  weekStart,
  weeklySummary,
} from "../../../functions/lib/staffDomain.mjs";
import {
  readReceipt,
  staffOperation,
  staffRequest,
} from "../../services/staffService.js";
import useStaffBoard from "./useStaffBoard.js";
import {
  buttonClass,
  exportStatement,
  inputClass,
  labelFor,
  money,
  propertyName,
  secondaryClass,
  statusLabels,
  taskLabels,
  vietnameseError,
} from "./staffUi.js";

export default function StaffPortal({ user, profile, preview = false }) {
  const [language, setLanguage] = useState(
    () =>
      localStorage.getItem("kolab-staff-language") || profile.language || "vi",
  );
  const [tab, setTab] = useState("today");
  const [date, setDate] = useState(staffToday);
  const state = useStaffBoard(profile.uid || user.uid, date);
  const { board, busy, run } = state;
  const t = (en, vi) => (language === "vi" ? vi : en);
  const changeLanguage = () => {
    const next = language === "vi" ? "en" : "vi";
    setLanguage(next);
    localStorage.setItem("kolab-staff-language", next);
  };
  return (
    <div
      className={`bg-[#F9F8F2] text-[#26402E] ${preview ? "rounded-3xl border" : "staff-workspace min-h-screen"}`}
    >
      <header className="border-b border-[#26402E]/10 bg-white px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div>
            <div className="font-serif text-2xl font-bold">
              Kolab{" "}
              <span className="font-sans text-xs tracking-widest uppercase ml-1">
                {t("My work", "Công việc")}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">{profile.name}</p>
          </div>
          <div className="flex gap-2">
            <button className={secondaryClass} onClick={changeLanguage}>
              {language === "vi" ? "English" : "Tiếng Việt"}
            </button>
            {!preview && (
              <button
                aria-label={t("Sign out", "Đăng xuất")}
                className="p-3"
                onClick={() => signOut(auth)}
              >
                <LogOut size={20} />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 pb-28 space-y-5">
        {preview && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm">
            Manager preview · Changes here update this staff member’s records.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              {t("Your workspace", "Không gian làm việc")}
            </p>
            <h1 className="font-serif text-3xl mt-1">
              {tab === "today"
                ? t("Let’s make it feel like home.", "Cùng chăm sóc ngôi nhà.")
                : tab === "pay"
                  ? t("Your pay, clearly.", "Thu nhập rõ ràng.")
                  : t("Purchases for the house", "Mua sắm cho nhà")}
            </h1>
          </div>
          <button
            aria-label={t("Refresh", "Làm mới")}
            disabled={busy}
            className={secondaryClass}
            onClick={state.refresh}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <label className="block text-sm max-w-xs">
          {t("Work date", "Ngày làm việc")}
          <input
            type="date"
            className={inputClass}
            value={date}
            disabled={busy}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <Feedback state={state} t={t} />
        {!board && !state.error && (
          <p role="status">{t("Loading your records…", "Đang tải dữ liệu…")}</p>
        )}
        {board && (
          <>
            {tab === "today" && (
              <Today
                key={date}
                board={board}
                date={date}
                run={run}
                disabled={busy || !state.online}
                t={t}
                language={language}
              />
            )}
            {tab === "pay" && (
              <Pay
                board={board}
                date={date}
                setDate={setDate}
                disabled={busy}
                t={t}
                language={language}
              />
            )}
            {tab === "purchases" && (
              <Purchases
                key={`${profile.uid}:${date}`}
                board={board}
                date={date}
                run={run}
                disabled={busy || !state.online}
                t={t}
                language={language}
              />
            )}
          </>
        )}
      </main>
      <nav
        aria-label={t("Staff navigation", "Điều hướng nhân viên")}
        className={`${preview ? "sticky rounded-b-3xl" : "fixed"} bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur z-10 px-3 pb-[env(safe-area-inset-bottom)]`}
      >
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-2 py-2">
          {[
            ["today", <ClipboardList size={21} />, t("Today", "Hôm nay")],
            ["pay", <Wallet size={21} />, t("My pay", "Thu nhập")],
            ["purchases", <Receipt size={21} />, t("Purchases", "Mua sắm")],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              disabled={busy}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
              className={`rounded-2xl py-3 flex flex-col items-center gap-1 text-sm font-semibold ${tab === id ? "bg-[#E2F05D] text-[#26402E]" : "text-slate-500"}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Feedback({ state, t = (en) => en }) {
  return (
    <div aria-live="polite" className="space-y-2">
      {!state.online && (
        <p className="rounded-xl p-3 bg-amber-100 text-amber-900">
          {t(
            "You’re offline. Reconnect before saving; unsaved changes stay on this screen.",
            "Bạn đang ngoại tuyến. Kết nối lại để lưu; nội dung chưa lưu vẫn ở màn hình này.",
          )}
        </p>
      )}
      {state.busy && (
        <p role="status" className="text-sm">
          {t(
            "Saving… Please keep this screen open.",
            "Đang lưu… Vui lòng giữ màn hình này.",
          )}
        </p>
      )}
      {state.feedback?.saved && (
        <p className="rounded-xl p-3 bg-green-50 text-green-800 text-sm">
          {t("Saved successfully.", "Đã lưu thành công.")}
        </p>
      )}
      {(state.error || state.feedback?.error) && (
        <div role="alert" className="rounded-xl p-4 bg-red-50 text-red-800">
          <p>
            {t(
              state.error || state.feedback.error,
              vietnameseError(state.error || state.feedback.error),
            )}
          </p>
          <button
            disabled={state.busy || !state.online}
            className="underline mt-2"
            onClick={() =>
              state.feedback?.operation
                ? state.run(state.feedback.operation, state.feedback.onSuccess)
                : state.refresh()
            }
          >
            {t("Retry", "Thử lại")}
          </button>
        </div>
      )}
    </div>
  );
}

function Today({ board, date, run, disabled, t, language }) {
  const [review, setReview] = useState(false),
    [note, setNote] = useState("");
  const day = board.day,
    tasks = day?.tasks || [],
    earnings = dayEarnings(tasks);
  const locked = disabled || day?.status !== "draft" || date > staffToday();
  const uid = board.profile.uid;
  if (!day || !tasks.length)
    return (
      <section className="rounded-3xl border border-dashed border-[#26402E]/25 p-10 text-center bg-white">
        <ClipboardList size={36} className="mx-auto mb-4 text-slate-400" />
        <h2 className="font-semibold text-lg">
          {t(
            "No work assigned for this date yet",
            "Chưa có công việc cho ngày này",
          )}
        </h2>
        <p className="text-slate-500 mt-2">
          {t(
            "Your manager will publish your rooms and shared-area tasks here.",
            "Quản lý sẽ giao phòng và công việc khu vực chung tại đây.",
          )}
        </p>
      </section>
    );
  return (
    <>
      <section className="bg-[#26402E] text-white rounded-3xl p-6">
        <div className="flex justify-between items-center gap-4">
          <div>
            <p className="text-sm text-white/70">
              {t("Your progress", "Tiến độ")}
            </p>
            <p className="text-3xl font-semibold mt-2">
              {earnings.completed}
              <span className="text-lg text-white/50"> / {tasks.length}</span>
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
            {labelFor(statusLabels, day.status, language)}
          </span>
        </div>
        <div className="h-2 bg-white/15 rounded-full mt-5 overflow-hidden">
          <div
            className="h-full bg-[#E2F05D] transition-all"
            style={{ width: `${(earnings.completed / tasks.length) * 100}%` }}
          />
        </div>
      </section>
      {day.reopenedReason && (
        <p className="rounded-xl bg-amber-50 p-4">
          {t("Manager’s correction note: ", "Ghi chú điều chỉnh: ")}
          {day.reopenedReason}
        </p>
      )}
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            locked={locked}
            t={t}
            language={language}
            onUpdate={(status, reason = "", recurringChecks = []) =>
              run(
                staffOperation("task", {
                  uid,
                  date,
                  taskId: task.id,
                  status,
                  reason,
                  recurringChecks,
                  revision: day.revision,
                }),
              )
            }
          />
        ))}
      </div>
      <section className="bg-white rounded-3xl border p-5 space-y-4">
        <div className="flex justify-between gap-4">
          <span>{t("Estimated wages today", "Thu nhập dự kiến hôm nay")}</span>
          <strong>
            {earnings.missingRates
              ? t("Rate needed", "Cần cập nhật đơn giá")
              : money(earnings.amountVnd)}
          </strong>
        </div>
        {day.status === "draft" && !review && (
          <button
            disabled={locked}
            className={`${buttonClass} w-full`}
            onClick={() => setReview(true)}
          >
            {t("Finish today", "Hoàn tất ngày làm việc")}
          </button>
        )}
        {review && day.status === "draft" && (
          <div className="space-y-4 border-t pt-4">
            <h2 className="font-semibold">
              {t("Review your day", "Kiểm tra ngày làm việc")}
            </h2>
            <p className="text-sm text-slate-600">
              {t(
                "Check the tasks above before submitting. Your manager will review your work and pay.",
                "Kiểm tra công việc phía trên trước khi gửi. Quản lý sẽ duyệt công việc và thu nhập.",
              )}
            </p>
            {tasks.some((task) => task.status === "pending") && (
              <p className="text-amber-800">
                {t(
                  "Some tasks still need to be completed or given a reason.",
                  "Một số công việc chưa hoàn tất hoặc chưa có lý do.",
                )}
              </p>
            )}
            <p className="text-sm">
              {t("Purchases recorded today", "Mua sắm đã ghi hôm nay")}:{" "}
              {board.purchases.filter((p) => p.date === date).length}
            </p>
            <label className="block text-sm">
              {t(
                "Note for your manager (optional)",
                "Ghi chú cho quản lý (không bắt buộc)",
              )}
              <textarea
                className={inputClass}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <button
                disabled={locked}
                className={secondaryClass}
                onClick={() => setReview(false)}
              >
                {t("Back", "Quay lại")}
              </button>
              <button
                disabled={
                  locked || tasks.some((task) => task.status === "pending")
                }
                className={buttonClass}
                onClick={() =>
                  run(
                    staffOperation("submitDay", {
                      uid,
                      date,
                      note,
                      revision: day.revision,
                    }),
                  )
                }
              >
                {t("Submit completed day", "Gửi ngày làm việc")}
              </button>
            </div>
          </div>
        )}
        {day.status !== "draft" && (
          <p className="text-sm text-slate-500">
            {t(
              "Your day has been submitted. Ask your manager if anything needs correcting.",
              "Ngày làm việc đã được gửi. Liên hệ quản lý nếu cần điều chỉnh.",
            )}
          </p>
        )}
      </section>
    </>
  );
}

function TaskCard({ task, locked, onUpdate, t, language }) {
  const [reasonOpen, setReasonOpen] = useState(false),
    [reason, setReason] = useState(task.reason || ""),
    [checklistOpen, setChecklistOpen] = useState(false),
    [checks, setChecks] = useState({}),
    [checklistError, setChecklistError] = useState(false);
  const recurring = task.recurringTodos || [];
  const pendingRecurring = recurring.filter((todo) => todo.status !== 'done');
  const checklistReady = pendingRecurring.every((todo) => checks[todo.id]?.completed || checks[todo.id]?.reason?.trim());
  const requestComplete = () => {
    if (task.status === 'done') return onUpdate('pending');
    if (!pendingRecurring.length) return onUpdate('done');
    setChecks(Object.fromEntries(pendingRecurring.map((todo) => [todo.id, { completed: false, reason: todo.reason || '' }])));
    setChecklistError(false);
    setChecklistOpen(true);
  };
  return (
    <article
      className={`rounded-2xl border p-5 ${task.status === "done" ? "bg-green-50 border-green-200" : "bg-white border-slate-200"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">
            {propertyName(task.propertyId)}
          </p>
          <h2 className="font-semibold text-xl mt-1">{task.label}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {labelFor(taskLabels, task.type, language)}
          </p>
        </div>
        <button
          aria-label={`${task.status === "done" ? t("Undo", "Bỏ hoàn tất") : t("Complete", "Hoàn thành")} ${task.label}`}
          aria-pressed={task.status === "done"}
          disabled={locked}
          onClick={requestComplete}
          className={`h-12 w-12 shrink-0 grid place-items-center rounded-full border-2 disabled:opacity-50 ${task.status === "done" ? "bg-[#26402E] border-[#26402E] text-white" : "border-slate-300 text-slate-400"}`}
        >
          <Check size={24} />
        </button>
      </div>
      {recurring.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="font-semibold text-sm">{t('Recurring room tasks', 'Công việc định kỳ trong phòng')}</p>
          {recurring.map((todo) => <p key={todo.id} className="text-sm">
            {todo.status === 'done' ? '✓ ' : '○ '}{todo.description}
            {todo.status === 'done' ? ` · ${t('Completed', 'Đã hoàn tất')}` : ` · ${t('Due', 'Đến hạn')} ${todo.dueDate}`}
            {todo.reason && <span className="block text-amber-900">{todo.reason}</span>}
          </p>)}
        </div>
      )}
      {checklistOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-label={t('Confirm recurring room tasks', 'Xác nhận công việc định kỳ')}
            className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90dvh] overflow-y-auto">
            <h3 className="font-semibold text-xl">{task.label} · {t('Room cleaned?', 'Đã dọn phòng?')}</h3>
            <p className="text-sm text-slate-600">{t('Also completed these tasks? Tick each one, or explain why it could not be done. Only tick work you completed.', 'Bạn đã làm các việc này chưa? Tích từng việc đã làm, hoặc ghi lý do chưa thể làm. Chỉ tích việc bạn đã hoàn tất.')}</p>
            {pendingRecurring.map((todo) => <div key={todo.id} className="rounded-xl border p-3 space-y-2">
              <label className="flex items-center gap-3 min-h-11 font-semibold">
                <input type="checkbox" className="h-6 w-6" checked={!!checks[todo.id]?.completed} disabled={locked}
                  onChange={(e) => setChecks((old) => ({ ...old, [todo.id]: { ...old[todo.id], completed: e.target.checked } }))} />
                {todo.description}?
              </label>
              {!checks[todo.id]?.completed && <label className="block text-sm">
                {t('If not completed, why?', 'Nếu chưa làm, lý do là gì?')}
                <textarea className={inputClass} maxLength={500} disabled={locked} value={checks[todo.id]?.reason || ''}
                  onChange={(e) => setChecks((old) => ({ ...old, [todo.id]: { ...old[todo.id], reason: e.target.value } }))} />
              </label>}
            </div>)}
            <p className="text-xs text-slate-500">{t('Completed items restart their interval from today. Items not completed remain due. Undoing the room clean does not undo these separately confirmed items.', 'Việc đã hoàn tất sẽ tính lại chu kỳ từ hôm nay. Việc chưa làm vẫn đến hạn. Bỏ hoàn tất dọn phòng không hủy các việc định kỳ đã xác nhận riêng.')}</p>
            {checklistError && <p role="alert" className="text-red-800 text-sm">{t('Could not save. Close this dialog to review the error and refresh the checklist before retrying.', 'Chưa lưu được. Đóng hộp thoại để xem lỗi và tải lại danh sách trước khi thử lại.')}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" className={secondaryClass} disabled={locked} onClick={() => setChecklistOpen(false)}>{t('Cancel', 'Hủy')}</button>
              <button type="button" className={buttonClass} disabled={locked || !checklistReady} onClick={async () => {
                const decisions = pendingRecurring.map((todo) => ({ id: todo.id, completed: !!checks[todo.id]?.completed, reason: checks[todo.id]?.reason || '' }));
                if (await onUpdate('done', '', decisions)) setChecklistOpen(false);
                else setChecklistError(true);
              }}>{t('Confirm room and checklist', 'Xác nhận phòng và danh sách')}</button>
            </div>
          </section>
        </div>
      )}
      {(task.availableAfter || task.dueBy) && (
        <p className="text-sm mt-3 text-slate-600">
          {task.availableAfter && `${t("After", "Sau")} ${task.availableAfter}`}{" "}
          {task.dueBy && ` · ${t("Before", "Trước")} ${task.dueBy}`}
        </p>
      )}
      {task.instructions && (
        <p className="text-sm mt-3 bg-[#F9F8F2] rounded-xl p-3">
          {task.instructions}
        </p>
      )}
      {task.reason && (
        <p className="text-sm text-amber-800 mt-3">{task.reason}</p>
      )}
      {!locked && task.status !== "done" && (
        <button
          className="text-sm underline mt-3 min-h-11"
          onClick={() => setReasonOpen((v) => !v)}
        >
          {t(
            "Couldn’t complete / report an issue",
            "Chưa thể hoàn thành / báo vấn đề",
          )}
        </button>
      )}
      {reasonOpen && !locked && (
        <div className="space-y-3 mt-2">
          <label className="block text-sm">
            {t("What happened?", "Đã xảy ra việc gì?")}
            <textarea
              className={inputClass}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                "Guest declined, cannot enter, missing supplies…",
                "Khách từ chối, không vào được, thiếu đồ dùng…",
              )}
            />
          </label>
          <button
            className={secondaryClass}
            disabled={!reason.trim()}
            onClick={async () => {
              if (await onUpdate("blocked", reason)) setReasonOpen(false);
            }}
          >
            {t("Save reason", "Lưu lý do")}
          </button>
        </div>
      )}
    </article>
  );
}

export function Pay({
  board,
  date,
  setDate,
  disabled,
  t = (en) => en,
  language = "en",
}) {
  const start = weekStart(date),
    summary = weeklySummary(board.days, board.purchases);
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center gap-2">
        <button
          aria-label={t("Previous week", "Tuần trước")}
          className={secondaryClass}
          disabled={disabled}
          onClick={() => setDate(addStaffDays(date, -7))}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center text-sm">
          <strong>{t("Monday–Sunday", "Thứ hai–Chủ nhật")}</strong>
          <p>
            {start} – {addStaffDays(start, 6)}
          </p>
        </div>
        <button
          aria-label={t("Next week", "Tuần sau")}
          className={secondaryClass}
          disabled={disabled}
          onClick={() => setDate(addStaffDays(date, 7))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <section className="bg-[#26402E] text-white rounded-3xl p-6 space-y-4">
        <p className="text-sm text-white/70">
          {t("Wages this week", "Thu nhập tuần này")}
        </p>
        <p className="text-3xl font-semibold">
          {summary.missingRates
            ? t("Rates pending", "Chờ đơn giá")
            : money(summary.wagesVnd)}
        </p>
        <div className="border-t border-white/20 pt-4 text-sm space-y-2">
          <div className="flex justify-between gap-2">
            <span>
              {t("Personal purchases claimed", "Tiền mua đồ cá nhân đã ứng")}
            </span>
            <span>{money(summary.reimbursementsVnd)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              {t("Approved, awaiting payment", "Đã duyệt, chờ thanh toán")}
            </span>
            <span>
              {money(
                summary.approvedWagesVnd + summary.approvedReimbursementsVnd,
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              {t(
                "Paid for this week’s records",
                "Đã trả cho các khoản tuần này",
              )}
            </span>
            <span>{money(summary.paidVnd)}</span>
          </div>
        </div>
      </section>
      <p className="text-sm text-slate-500">
        {t(
          "Draft and submitted work is estimated until approved. Only completed paid cleaning tasks appear below.",
          "Công việc chưa được duyệt chỉ là dự tính. Bên dưới chỉ hiển thị việc dọn dẹp đã hoàn thành có tính công.",
        )}
      </p>
      {[...board.days]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => (
          <section key={day.id} className="rounded-2xl bg-white border p-5">
            <div className="flex justify-between gap-3">
              <h3 className="font-semibold">{day.date}</h3>
              <span className="text-sm text-slate-500">
                {labelFor(statusLabels, day.status, language)}
              </span>
            </div>
            {day.tasks
              .filter((task) => task.status === "done" && task.rateVnd !== 0)
              .map((task) => (
                <div
                  key={task.id}
                  className="flex justify-between gap-3 text-sm border-b py-3"
                >
                  <span>
                    {task.label} · {labelFor(taskLabels, task.type, language)}
                  </span>
                  <span className="shrink-0">
                    {task.rateVnd == null
                      ? t("Rate pending", "Chờ đơn giá")
                      : money(task.rateVnd)}
                  </span>
                </div>
              ))}
            <div className="flex justify-between pt-3 font-semibold">
              <span>{t("Daily wages", "Thu nhập trong ngày")}</span>
              <span>{money(day.amountVnd)}</span>
            </div>
            {day.paymentDate && (
              <p className="text-sm text-slate-500 mt-2">
                {t("Paid", "Đã trả")} {day.paymentDate} · {day.method}{" "}
                {day.reference}
              </p>
            )}
          </section>
        ))}
      {!board.days.length && (
        <p className="rounded-2xl bg-white border p-6 text-slate-500">
          {t(
            "No work records this week.",
            "Chưa có ngày làm việc trong tuần này.",
          )}
        </p>
      )}
      <PurchaseList
        purchases={board.purchases.filter((p) => p.paidWith === "personal")}
        t={t}
        language={language}
      />
      <button
        className={`${secondaryClass} flex items-center gap-2`}
        onClick={() =>
          exportStatement(board.profile, start, board.days, board.purchases)
        }
      >
        <Download size={17} />
        {t("Download weekly statement", "Tải bảng kê tuần")}
      </button>
    </div>
  );
}

function Purchases({ board, date, run, disabled, t, language }) {
  const [form, setForm] = useState(() => ({
    purchaseId: crypto.randomUUID(),
    date: date > staffToday() ? staffToday() : date,
    propertyId: board.profile.propertyIds[0],
    description: "",
    amountVnd: "",
    paidWith: "personal",
    receiptMissingReason: "",
    receiptData: "",
  }));
  const [error, setError] = useState(""),
    [reading, setReading] = useState(false);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    setError("");
    await run(
      staffOperation("purchase", { ...form, uid: board.profile.uid }),
      () =>
        setForm((previous) => ({
          ...previous,
          purchaseId: crypto.randomUUID(),
          description: "",
          amountVnd: "",
          receiptData: "",
          receiptMissingReason: "",
        })),
    );
  };
  return (
    <div className="space-y-5">
      <form
        onSubmit={save}
        className="bg-white border rounded-3xl p-5 space-y-4"
      >
        <h2 className="font-semibold text-xl">
          {t("Add a purchase", "Thêm khoản mua")}
        </h2>
        <fieldset
          disabled={disabled || reading}
          className="space-y-4 disabled:opacity-60"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              {t("Property", "Nhà")}
              <select
                className={inputClass}
                value={form.propertyId}
                onChange={(e) => set("propertyId", e.target.value)}
              >
                {board.profile.propertyIds.map((id) => (
                  <option key={id} value={id}>
                    {propertyName(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("Purchase date", "Ngày mua")}
              <input
                required
                type="date"
                max={staffToday()}
                className={inputClass}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            {t("What did you buy?", "Bạn đã mua gì?")}
            <input
              required
              maxLength={500}
              className={inputClass}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ["Toilet paper", "Giấy vệ sinh"],
              ["Batteries", "Pin"],
              ["Soap", "Xà phòng"],
              ["Cleaning supplies", "Đồ vệ sinh"],
            ].map(([en, vi]) => (
              <button
                type="button"
                key={en}
                className="rounded-full border px-3 py-2 text-sm"
                onClick={() => set("description", t(en, vi))}
              >
                {t(en, vi)}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            {t("Total amount (VND)", "Tổng tiền (VND)")}
            <input
              required
              type="number"
              inputMode="numeric"
              min="1"
              max="1000000000"
              step="1"
              className={inputClass}
              value={form.amountVnd}
              onChange={(e) => set("amountVnd", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t("Paid with", "Nguồn tiền")}
            <select
              className={inputClass}
              value={form.paidWith}
              onChange={(e) => set("paidWith", e.target.value)}
            >
              <option value="personal">
                {t("My money — reimburse me", "Tiền của tôi — cần hoàn lại")}
              </option>
              <option value="house">
                {t(
                  "House money — no reimbursement",
                  "Tiền của nhà — không cần hoàn lại",
                )}
              </option>
            </select>
          </label>
          <label className="block text-sm">
            {t("Receipt photo", "Ảnh hóa đơn")}
            <input
              key={form.purchaseId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm"
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setReading(true);
                setError("");
                try {
                  set("receiptData", await readReceipt(file));
                } catch (err) {
                  setError(err.message);
                } finally {
                  setReading(false);
                }
              }}
            />
          </label>
          {form.receiptData && (
            <div>
              <img
                src={form.receiptData}
                alt={t("Receipt preview", "Xem trước hóa đơn")}
                className="max-h-48 rounded-xl border"
              />
              <button
                type="button"
                className="underline text-sm mt-2"
                onClick={() => set("receiptData", "")}
              >
                {t("Remove photo", "Xóa ảnh")}
              </button>
            </div>
          )}
          {!form.receiptData && (
            <label className="block text-sm">
              {t(
                "If no receipt, explain why",
                "Nếu không có hóa đơn, ghi lý do",
              )}
              <input
                required
                maxLength={500}
                className={inputClass}
                value={form.receiptMissingReason}
                onChange={(e) => set("receiptMissingReason", e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className={`${buttonClass} w-full`}>
            {t("Submit purchase", "Gửi khoản mua")}
          </button>
        </fieldset>
      </form>
      <h2 className="font-semibold">
        {t("Purchases this week", "Mua sắm tuần này")}
      </h2>
      <PurchaseList purchases={board.purchases} t={t} language={language} />
    </div>
  );
}

export function PurchaseList({ purchases, t = (en) => en, language = "en" }) {
  const [receipt, setReceipt] = useState(null),
    [error, setError] = useState("");
  return (
    <div className="space-y-3">
      {purchases.map((p) => (
        <article key={p.id} className="rounded-2xl border bg-white p-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold">{p.description}</h3>
            <strong className="shrink-0">{money(p.amountVnd)}</strong>
          </div>
          <p className="text-sm text-slate-500 mt-2">
            {p.date} · {propertyName(p.propertyId)} ·{" "}
            {labelFor(statusLabels, p.status, language)}
          </p>
          <p className="text-sm mt-2">
            {p.paidWith === "personal"
              ? t(
                  "Personal money · reimbursement",
                  "Tiền cá nhân · cần hoàn lại",
                )
              : t(
                  "House money · no reimbursement",
                  "Tiền của nhà · không cần hoàn lại",
                )}
          </p>
          {p.reviewReason && (
            <p className="text-amber-800 text-sm mt-2">{p.reviewReason}</p>
          )}
          {p.receiptMissingReason && (
            <p className="text-sm text-slate-500 mt-2">
              {t("Receipt note: ", "Ghi chú hóa đơn: ")}
              {p.receiptMissingReason}
            </p>
          )}
          {p.paymentDate && (
            <p className="text-sm mt-2">
              {t("Paid", "Đã trả")} {p.paymentDate} · {p.method} {p.reference}
            </p>
          )}
          {p.hasReceipt && (
            <button
              className="underline text-sm min-h-11"
              onClick={async () => {
                try {
                  setError("");
                  setReceipt(
                    (await staffRequest("receipt", { purchaseId: p.id })).data,
                  );
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              {t("View receipt", "Xem hóa đơn")}
            </button>
          )}
        </article>
      ))}
      {!purchases.length && (
        <p className="text-sm text-slate-500">
          {t(
            "No purchases recorded for this week.",
            "Chưa ghi khoản mua nào cho tuần này.",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {receipt && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-5 flex items-center justify-center"
          onClick={() => setReceipt(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("Receipt", "Hóa đơn")}
            className="bg-white rounded-2xl p-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className={`${secondaryClass} mb-3`}
              onClick={() => setReceipt(null)}
            >
              {t("Close", "Đóng")}
            </button>
            <img
              src={receipt}
              alt={t("Purchase receipt", "Hóa đơn mua hàng")}
              className="max-h-[70vh] max-w-full"
            />
          </section>
        </div>
      )}
    </div>
  );
}
