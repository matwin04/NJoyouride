// ==============================
// SIDEBAR RESIZE MODULE (ADVANCED)
// ==============================

export function initResize() {
    const sidebar = document.getElementById("side-panel");
    const handle = document.getElementById("resize-handle");

    if (!sidebar || !handle) return;

    const MIN = 220;
    const MAX = 600;
    const DEFAULT = 320;

    // Snap points (like VS Code)
    const SNAP_POINTS = [260, 320, 400, 480];

    let isResizing = false;

    // ==============================
    // LOAD SAVED WIDTH
    // ==============================
    const savedWidth = localStorage.getItem("sidebarWidth");
    if (savedWidth) {
        sidebar.style.width = savedWidth + "px";
    }

    // ==============================
    // START RESIZE
    // ==============================
    handle.addEventListener("mousedown", () => {
        isResizing = true;
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
    });

    // ==============================
    // RESIZING
    // ==============================
    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;

        let newWidth = e.clientX;

        // Clamp
        newWidth = Math.max(MIN, Math.min(MAX, newWidth));

        sidebar.style.width = newWidth + "px";
    });

    // ==============================
    // END RESIZE (SNAP + SAVE)
    // ==============================
    document.addEventListener("mouseup", () => {
        if (!isResizing) return;

        isResizing = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";

        let width = sidebar.offsetWidth;

        // Snap to closest point
        const snapped = SNAP_POINTS.reduce((prev, curr) =>
            Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev
        );

        sidebar.style.width = snapped + "px";

        // Save to localStorage
        localStorage.setItem("sidebarWidth", snapped);
    });

    // ==============================
    // DOUBLE CLICK → RESET
    // ==============================
    handle.addEventListener("dblclick", () => {
        sidebar.style.width = DEFAULT + "px";
        localStorage.setItem("sidebarWidth", DEFAULT);
    });
}
