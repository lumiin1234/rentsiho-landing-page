"use strict";
window.confirmDelete = function (message) {
  const dialog = document.getElementById("delete-dialog");
  if (dialog.open) return Promise.resolve(false);
  document.getElementById("delete-message").textContent = message;
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "delete"), { once: true });
    dialog.showModal();
  });
};
