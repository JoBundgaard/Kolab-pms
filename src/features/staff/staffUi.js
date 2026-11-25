export const money = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(n);
export const inputClass =
  "mt-1 block w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#94ad85]";
export const buttonClass =
  "min-h-11 rounded-full bg-[#26402E] px-5 py-2.5 font-semibold text-white disabled:opacity-40";
export const secondaryClass =
  "min-h-11 rounded-full border border-slate-300 bg-white px-4 py-2 text-[#26402E] disabled:opacity-40";
export const taskLabels = {
  checkout: ["Checkout clean", "Dọn phòng trả"],
  weekly: ["Weekly clean", "Dọn phòng hằng tuần"],
  check_room: ["Room check", "Kiểm tra phòng"],
  shared: ["Shared area", "Khu vực chung"],
  recurring: ["Special cleaning", "Vệ sinh định kỳ"],
};
export const statusLabels = {
  draft: ["In progress", "Đang làm"],
  pending: ["To do", "Cần làm"],
  done: ["Done", "Đã xong"],
  blocked: ["Couldn’t complete", "Chưa thể hoàn thành"],
  submitted: ["Awaiting approval", "Chờ duyệt"],
  approved: ["Approved", "Đã duyệt"],
  paid: ["Paid", "Đã thanh toán"],
  rejected: ["Needs correction", "Cần điều chỉnh"],
};
export const propertyName = (id) =>
  ({ prop_1: "Townhouse", prop_2: "Neighbours", prop_3: "Roamr" })[id] || id;
export const labelFor = (map, key, language) =>
  map[key]?.[language === "vi" ? 1 : 0] || key;
export function exportStatement(profile, start, days, purchases) {
  const rows = [
    [
      "Staff",
      "Date",
      "Type",
      "Description",
      "Amount VND",
      "Status",
      "Paid date",
      "Payment method",
      "Reference",
    ],
  ];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const task of day.tasks.filter(
      (t) => t.status === "done" && t.rateVnd !== 0,
    ))
      rows.push([
        profile.name,
        day.date,
        "Wages",
        `${task.label} · ${taskLabels[task.type]?.[0] || task.type}`,
        task.rateVnd ?? "Rate not set",
        day.status,
        day.paymentDate || "",
        day.method || "",
        day.reference || "",
      ]);
  }
  for (const p of purchases.filter((p) => p.paidWith === "personal"))
    rows.push([
      profile.name,
      p.date,
      "Reimbursement",
      p.description,
      p.amountVnd,
      p.status,
      p.paymentDate || "",
      p.method || "",
      p.reference || "",
    ]);
  const csv = rows
    .map((row) =>
      row
        .map(
          (v) =>
            `"${String(v)
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""')}"`,
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `kolab-pay-${start}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function vietnameseError(message = "") {
  const translations = [
    [
      "This day changed.",
      "Ngày làm việc đã thay đổi. Hãy làm mới rồi thử lại.",
    ],
    [
      "This day is locked.",
      "Ngày làm việc đã khóa. Nhờ quản lý mở lại nếu cần điều chỉnh.",
    ],
    ["Future work cannot", "Chưa thể hoàn thành công việc của ngày tương lai."],
    [
      "Complete each task",
      "Hoàn tất từng công việc hoặc ghi lý do chưa thể hoàn thành.",
    ],
    [
      "Explain why the task",
      "Vui lòng ghi lý do chưa thể hoàn thành công việc.",
    ],
    [
      "Task unavailable.",
      "Công việc không còn khả dụng. Hãy làm mới ngày làm việc.",
    ],
    [
      "Staff access is not active.",
      "Quyền truy cập đã bị tắt. Vui lòng liên hệ quản lý.",
    ],
    [
      "Your account has not",
      "Tài khoản chưa được cấp quyền. Vui lòng liên hệ quản lý.",
    ],
    ["You can only access", "Bạn chỉ có thể xem và cập nhật dữ liệu của mình."],
    [
      "Purchase already submitted.",
      "Khoản mua này đã được gửi. Hãy kiểm tra danh sách trước khi thêm khoản khác.",
    ],
    [
      "Attach a receipt",
      "Đính kèm hóa đơn hoặc giải thích lý do không có hóa đơn.",
    ],
    ["Purchases cannot be in the future.", "Ngày mua không thể ở tương lai."],
    [
      "Choose one of your properties.",
      "Chọn một trong các nhà được giao cho bạn.",
    ],
    [
      "Enter a valid whole VND amount.",
      "Nhập số tiền VND hợp lệ, không có phần thập phân.",
    ],
    ["Enter an amount in VND.", "Nhập số tiền bằng VND."],
    ["Choose a valid date.", "Chọn ngày hợp lệ."],
    ["Describe the purchase.", "Ghi mô tả món đồ đã mua."],
    ["Receipt unavailable.", "Không thể xem hóa đơn này."],
    [
      "Invalid receipt image.",
      "Ảnh hóa đơn không hợp lệ. Vui lòng chọn ảnh khác.",
    ],
    [
      "Use a JPEG or PNG receipt",
      "Chọn ảnh hóa đơn JPEG hoặc PNG nhỏ hơn 500 KB.",
    ],
    [
      "Your manager needs to assign",
      "Quản lý cần giao công việc cho ngày này trước.",
    ],
  ];
  return (
    translations.find(([prefix]) => message.includes(prefix))?.[1] ||
    `Không thể hoàn tất. Kiểm tra kết nối rồi thử lại. (${message})`
  );
}
