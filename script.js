// 오늘의 체크: 외부 라이브러리 없이 동작하는 할 일 앱입니다.
// 데이터는 현재 브라우저의 localStorage에 저장됩니다.
(() => {
  "use strict";

  const STORAGE_KEY = "todays-check-tasks-v1";
  const CATEGORY = {
    work: { label: "업무", emoji: "💼" },
    study: { label: "공부", emoji: "📚" },
    personal: { label: "개인", emoji: "🌿" }
  };
  const PRIORITY = {
    high: { label: "중요", order: 0 },
    normal: { label: "보통", order: 1 },
    low: { label: "여유", order: 2 }
  };
  const SCOPE_TITLE = {
    all: "모든 할 일",
    today: "오늘 할 일",
    upcoming: "예정된 할 일",
    completed: "완료한 할 일"
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const taskForm = $("#task-form");
  const editForm = $("#edit-form");
  const editDialog = $("#edit-dialog");
  const taskList = $("#task-list");
  const template = $("#task-template");
  const searchInput = $("#task-search");
  const toast = $("#toast");
  const todayString = () => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  };

  let tasks = loadTasks();
  let currentScope = "all";
  let currentCategory = "all";
  let currentSearch = "";
  let editingId = null;
  let undoDelete = null;
  let toastTimer = null;

  function loadTasks() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.filter((task) => task && typeof task.title === "string" && task.id)
        .map((task) => ({
          id: String(task.id),
          title: task.title.slice(0, 120),
          category: CATEGORY[task.category] ? task.category : "personal",
          priority: PRIORITY[task.priority] ? task.priority : "normal",
          due: /^\d{4}-\d{2}-\d{2}$/.test(task.due || "") ? task.due : "",
          completed: Boolean(task.completed),
          createdAt: Number(task.createdAt) || Date.now()
        }));
    } catch {
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      showToast("저장에 실패했어요. 브라우저 저장공간을 확인해주세요.");
    }
  }

  function makeId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function showToast(message, allowUndo = false) {
    clearTimeout(toastTimer);
    $("#toast-message").textContent = message;
    $("#toast-undo").hidden = !allowUndo;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      undoDelete = null;
    }, 6000);
  }

  function getDueText(due, completed) {
    const today = todayString();
    if (due === today) return "오늘 마감";
    if (due < today && !completed) return "기한 지남 · " + formatShortDate(due);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0")
    ].join("-");
    if (due === tomorrowISO) return "내일 마감";
    return formatShortDate(due);
  }

  function formatShortDate(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return year === new Date().getFullYear()
      ? `${month}월 ${day}일`
      : `${year}년 ${month}월 ${day}일`;
  }

  function isInScope(task) {
    const today = todayString();
    if (currentScope === "today") return task.due === today;
    if (currentScope === "upcoming") return Boolean(task.due && task.due > today && !task.completed);
    if (currentScope === "completed") return task.completed;
    return true;
  }

  function sortTasks(a, b) {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    const dateA = a.due || "9999-12-31";
    const dateB = b.due || "9999-12-31";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    if (a.priority !== b.priority) return PRIORITY[a.priority].order - PRIORITY[b.priority].order;
    return b.createdAt - a.createdAt;
  }

  function filteredTasks() {
    return tasks.filter((task) => (
      isInScope(task) &&
      (currentCategory === "all" || task.category === currentCategory) &&
      task.title.toLocaleLowerCase("ko").includes(currentSearch)
    )).sort(sortTasks);
  }

  function renderTask(task) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.classList.toggle("is-done", task.completed);
    const check = node.querySelector(".task-check");
    check.checked = task.completed;
    check.setAttribute("aria-label", `${task.title} ${task.completed ? "완료 취소" : "완료 표시"}`);
    node.querySelector(".task-name").textContent = task.title;

    const category = node.querySelector(".category-badge");
    category.textContent = CATEGORY[task.category].emoji + " " + CATEGORY[task.category].label;
    category.classList.add(task.category);

    const due = node.querySelector(".due-badge");
    if (task.due) {
      due.hidden = false;
      due.textContent = "▣ " + getDueText(task.due, task.completed);
      due.classList.toggle("is-overdue", task.due < todayString() && !task.completed);
    }
    const priority = node.querySelector(".priority-badge");
    priority.textContent = PRIORITY[task.priority].label;
    priority.classList.add(task.priority);
    return node;
  }

  function render() {
    const today = todayString();
    const counts = {
      all: tasks.length,
      today: tasks.filter((task) => task.due === today).length,
      upcoming: tasks.filter((task) => task.due && task.due > today && !task.completed).length,
      completed: tasks.filter((task) => task.completed).length
    };
    Object.entries(counts).forEach(([scope, count]) => {
      $("#count-" + scope).textContent = count;
    });
    $$(".nav-button").forEach((button) => {
      const selected = button.dataset.scope === currentScope;
      button.classList.toggle("is-current", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    $$(".filter-chip").forEach((button) => {
      const selected = button.dataset.category === currentCategory;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const percent = tasks.length ? Math.round(counts.completed / tasks.length * 100) : 0;
    $("#progress-percent").textContent = percent + "%";
    $("#progress-fill").style.width = percent + "%";
    $("#progress-track").setAttribute("aria-valuenow", String(percent));
    $("#stat-total").textContent = counts.all;
    $("#stat-done").textContent = counts.completed;
    $("#stat-left").textContent = counts.all - counts.completed;
    $("#clear-completed").hidden = counts.completed === 0;

    const visible = filteredTasks();
    $("#list-title").firstChild.textContent = SCOPE_TITLE[currentScope] + " ";
    $("#visible-count").textContent = visible.length;
    taskList.replaceChildren(...visible.map(renderTask));
    const empty = $("#empty-state");
    empty.hidden = visible.length !== 0;
    if (visible.length === 0) {
      const noTasks = tasks.length === 0;
      const isSearching = currentSearch.length > 0;
      $("#empty-title").textContent = noTasks ? "아직 할 일이 없어요"
        : isSearching ? "검색 결과가 없어요" : "여기는 아직 비어 있어요";
      $("#empty-description").textContent = noTasks ? "첫 번째 할 일을 적고 오늘을 시작해볼까요?"
        : isSearching ? "다른 검색어를 입력해 보세요."
        : "새로운 할 일을 추가하거나 다른 메뉴를 살펴보세요.";
      $("#focus-add").hidden = !noTasks && (isSearching || currentScope !== "all");
    }
  }

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = taskForm.elements;
    const title = fields.namedItem("title").value.trim();
    if (!title) {
      fields.namedItem("title").focus();
      return;
    }
    tasks.unshift({
      id: makeId(),
      title,
      category: fields.namedItem("category").value,
      priority: fields.namedItem("priority").value,
      due: fields.namedItem("due").value,
      completed: false,
      createdAt: Date.now()
    });
    saveTasks();
    taskForm.reset();
    currentScope = "all";
    currentCategory = "all";
    currentSearch = "";
    searchInput.value = "";
    render();
    showToast("할 일을 추가했어요!");
    fields.namedItem("title").focus();
  });

  $$(".nav-button").forEach((button) => button.addEventListener("click", () => {
    currentScope = button.dataset.scope;
    render();
  }));
  $$(".filter-chip").forEach((button) => button.addEventListener("click", () => {
    currentCategory = button.dataset.category;
    render();
  }));
  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value.trim().toLocaleLowerCase("ko");
    render();
  });

  taskList.addEventListener("change", (event) => {
    if (!event.target.matches(".task-check")) return;
    const task = tasks.find((item) => item.id === event.target.closest(".task-card").dataset.id);
    if (!task) return;
    task.completed = event.target.checked;
    saveTasks();
    render();
    if (task.completed) showToast("멋져요! 하나를 완료했어요 ✨");
  });

  taskList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = button.closest(".task-card").dataset.id;
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    if (button.matches(".edit-task")) {
      editingId = id;
      editForm.elements.namedItem("title").value = task.title;
      editForm.elements.namedItem("category").value = task.category;
      editForm.elements.namedItem("priority").value = task.priority;
      editForm.elements.namedItem("due").value = task.due;
      editDialog.showModal();
    } else if (button.matches(".delete-task")) {
      const index = tasks.findIndex((item) => item.id === id);
      undoDelete = { task, index };
      tasks.splice(index, 1);
      saveTasks();
      render();
      showToast("할 일을 삭제했어요.", true);
    }
  });

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const task = tasks.find((item) => item.id === editingId);
    const title = editForm.elements.namedItem("title").value.trim();
    if (!task || !title) return;
    task.title = title;
    task.category = editForm.elements.namedItem("category").value;
    task.priority = editForm.elements.namedItem("priority").value;
    task.due = editForm.elements.namedItem("due").value;
    saveTasks();
    render();
    editDialog.close();
    editingId = null;
    showToast("변경사항을 저장했어요.");
  });
  $("#close-dialog").addEventListener("click", () => editDialog.close());
  $("#cancel-edit").addEventListener("click", () => editDialog.close());
  editDialog.addEventListener("close", () => { editingId = null; });

  $("#toast-undo").addEventListener("click", () => {
    if (undoDelete) {
      tasks.splice(undoDelete.index, 0, undoDelete.task);
      saveTasks();
      render();
      undoDelete = null;
      showToast("삭제를 취소했어요.");
    }
  });
  $("#clear-completed").addEventListener("click", () => {
    if (!confirm("완료한 할 일을 모두 삭제할까요?")) return;
    tasks = tasks.filter((task) => !task.completed);
    saveTasks();
    render();
    showToast("완료한 할 일을 정리했어요.");
  });
  $("#focus-add").addEventListener("click", () => {
    $("#task-title").focus();
    $("#task-title").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("#today-date").textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long"
  }).format(new Date());
  render();
})();
