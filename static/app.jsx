const { useEffect, useRef, useState } = React;

const TIMEZONE = window.APP_CONFIG.timezone;

function apiFetch(url, options = {}) {
    return fetch(url, {
        credentials: "same-origin",
        ...options,
    }).then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const message = payload?.error || "Request failed.";
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }

        return payload;
    });
}

function currentMonthKey() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    return `${year}-${month}`;
}

function sortBodyParts(parts) {
    return [...parts].sort((left, right) => {
        if ((left.sort_order || 0) !== (right.sort_order || 0)) {
            return (left.sort_order || 0) - (right.sort_order || 0);
        }
        return left.label.localeCompare(right.label);
    });
}

function sortExercises(exercises, bodyParts) {
    const orderMap = new Map(
        bodyParts.map((part, index) => [part.id, part.sort_order || index + 1])
    );

    return [...exercises].sort((left, right) => {
        const leftOrder = orderMap.get(left.body_part) || 999;
        const rightOrder = orderMap.get(right.body_part) || 999;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        if ((left.sort_order || 0) !== (right.sort_order || 0)) {
            return (left.sort_order || 0) - (right.sort_order || 0);
        }
        return left.name.localeCompare(right.name);
    });
}

function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en-CA", {
        month: "long",
        year: "numeric",
        timeZone: TIMEZONE,
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function previousMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 2, 1));
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const value = new Date(Date.UTC(year, month, 1));
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatTimestamp(value) {
    if (!value) {
        return "";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}

function getInitialTheme() {
    const storedTheme = localStorage.getItem("workout-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
        return storedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function daysInMonth(year, monthNumber) {
    return new Date(year, monthNumber, 0).getDate();
}

function weekdayOffset(year, monthNumber) {
    return new Date(year, monthNumber - 1, 1).getDay();
}

function LoginScreen({ busy, error, onSubmit }) {
    const [username, setUsername] = useState("raza");
    const [password, setPassword] = useState("");

    function handleSubmit(event) {
        event.preventDefault();
        onSubmit(username, password);
    }

    return (
        <div className="login-shell">
            <section className="login-card">
                <p className="eyebrow">Training Ledger</p>
                <h1>Sign in to your workout log</h1>
                <p className="lede">
                    Persistent login, fast workout logging, diet taps, and a timeline
                    that keeps every session in one place.
                </p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label className="field">
                        <span>Username</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            required
                        />
                    </label>

                    <label className="field">
                        <span>Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </label>

                    {error ? <div className="error-banner">{error}</div> : null}

                    <button className="primary-button large" type="submit" disabled={busy}>
                        {busy ? "Signing in..." : "Enter app"}
                    </button>
                </form>
            </section>
        </div>
    );
}

function AppIcon({ children }) {
    return (
        <svg
            className="app-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

function SunIcon() {
    return (
        <AppIcon>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2.5v2.2" />
            <path d="M12 19.3v2.2" />
            <path d="M4.9 4.9l1.6 1.6" />
            <path d="M17.5 17.5l1.6 1.6" />
            <path d="M2.5 12h2.2" />
            <path d="M19.3 12h2.2" />
            <path d="M4.9 19.1l1.6-1.6" />
            <path d="M17.5 6.5l1.6-1.6" />
        </AppIcon>
    );
}

function MoonIcon() {
    return (
        <AppIcon>
            <path d="M19 14.8A7.8 7.8 0 1 1 9.2 5a6.4 6.4 0 0 0 9.8 9.8Z" />
        </AppIcon>
    );
}

function RefreshIcon() {
    return (
        <AppIcon>
            <path d="M20 11a8 8 0 1 0 2 5.4" />
            <path d="M20 4v7h-7" />
        </AppIcon>
    );
}

function LogoutIcon() {
    return (
        <AppIcon>
            <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" />
            <path d="M14 8l6 4-6 4" />
            <path d="M20 12H9" />
        </AppIcon>
    );
}

function IconButton({ label, onClick, disabled, children }) {
    return (
        <button
            className="icon-button"
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
}

function MetricControl({
    label,
    value,
    min,
    onChange,
    absoluteButtons = [],
    incrementButtons = [],
    trailingButton = null,
}) {
    return (
        <div className="metric-control">
            <div className="metric-header">
                <span>{label}</span>
                <input
                    type="number"
                    min={min}
                    value={value}
                    onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        onChange(Number.isNaN(nextValue) ? min : Math.max(min, nextValue));
                    }}
                />
            </div>

            <div className="metric-actions">
                {absoluteButtons.map((buttonValue) => (
                    <button
                        key={`${label}-abs-${buttonValue}`}
                        className={`mini-chip ${value === buttonValue ? "active" : ""}`}
                        type="button"
                        onClick={() => onChange(buttonValue)}
                    >
                        {buttonValue}
                    </button>
                ))}

                {incrementButtons.map((buttonValue) => (
                    <button
                        key={`${label}-inc-${buttonValue}`}
                        className="mini-chip"
                        type="button"
                        onClick={() => onChange(value + buttonValue)}
                    >
                        +{buttonValue}
                    </button>
                ))}

                {trailingButton ? trailingButton : null}
            </div>
        </div>
    );
}

function ExerciseCard({
    exercise,
    draftEntry,
    onToggleExercise,
    onChangeMetric,
}) {
    const selected = Boolean(draftEntry);

    return (
        <article className={`exercise-card ${selected ? "is-selected" : ""}`}>
            <div className="exercise-head">
                <div>
                    <h4>{exercise.name}</h4>
                    <p className="muted">
                        Default weight: {exercise.last_weight}
                        {exercise.is_custom ? " · custom" : ""}
                    </p>
                </div>

                <button
                    className={`${selected ? "secondary-button" : "primary-button"} compact-button`}
                    type="button"
                    onClick={() => onToggleExercise(exercise)}
                >
                    {selected ? "Remove" : "Add"}
                </button>
            </div>

            {selected ? (
                <div className="exercise-metrics">
                    <MetricControl
                        label="Sets"
                        value={draftEntry.sets}
                        min={1}
                        absoluteButtons={[1, 2, 3, 4, 5]}
                        incrementButtons={[1]}
                        onChange={(value) => onChangeMetric(exercise.id, "sets", value)}
                    />

                    <MetricControl
                        label="Reps"
                        value={draftEntry.reps}
                        min={1}
                        absoluteButtons={[1, 2, 3, 4, 5]}
                        incrementButtons={[1, 5]}
                        onChange={(value) => onChangeMetric(exercise.id, "reps", value)}
                    />

                    <MetricControl
                        label="Weight"
                        value={draftEntry.weight}
                        min={0}
                        incrementButtons={[5, 10, 20]}
                        trailingButton={
                            <button
                                className="mini-chip"
                                type="button"
                                onClick={() =>
                                    onChangeMetric(
                                        exercise.id,
                                        "weight",
                                        exercise.last_weight || 0
                                    )
                                }
                            >
                                Default
                            </button>
                        }
                        onChange={(value) => onChangeMetric(exercise.id, "weight", value)}
                    />
                </div>
            ) : null}
        </article>
    );
}

function BodyPartSection({
    part,
    exercises,
    expanded,
    onToggle,
    draftEntries,
    onToggleExercise,
    onChangeMetric,
}) {
    return (
        <section className={`body-part-card ${expanded ? "is-open" : ""}`}>
            <button className="body-part-header" type="button" onClick={onToggle}>
                <div>
                    <p className="eyebrow">{part.label}</p>
                    <h3>{part.label}</h3>
                </div>
                <div className="body-part-meta">
                    <span>{exercises.length} exercises</span>
                    <span>{expanded ? "Collapse" : "Expand"}</span>
                </div>
            </button>

            {expanded ? (
                exercises.length ? (
                    <div className="exercise-list">
                        {exercises.map((exercise) => (
                            <ExerciseCard
                                key={exercise.id}
                                exercise={exercise}
                                draftEntry={draftEntries[exercise.id]}
                                onToggleExercise={onToggleExercise}
                                onChangeMetric={onChangeMetric}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-inline">No exercises in this section yet.</div>
                )
            ) : null}
        </section>
    );
}

function QuickPanel({
    bodyParts,
    exercises,
    expandedParts,
    draftEntries,
    collapsed,
    loggingWorkout,
    onToggleCollapsed,
    onToggleBodyPart,
    onExpandAll,
    onCollapseAll,
    onToggleExercise,
    onChangeMetric,
    onLogWorkout,
    onClearWorkout,
    onOpenManageExercises,
}) {
    const activeExercises = exercises.filter((exercise) => exercise.is_active);
    const selectedCount = Object.keys(draftEntries).length;

    const grouped = bodyParts.map((part) => ({
        ...part,
        exercises: activeExercises.filter((exercise) => exercise.body_part === part.id),
    }));

    return (
        <aside className={`panel quick-panel ${collapsed ? "is-collapsed" : ""}`}>
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Quick Tasks</p>
                    <h2>Workout builder</h2>
                </div>

                <div className="panel-header-actions">
                    <button
                        className="secondary-button compact-button panel-toggle"
                        type="button"
                        onClick={onToggleCollapsed}
                    >
                        {collapsed ? "Expand" : "Collapse"}
                    </button>
                </div>
            </div>

            {collapsed ? (
                <div className="collapsed-preview">
                    {activeExercises.length} exercises ready · {selectedCount} selected
                </div>
            ) : (
                <>
                    <div className="builder-toolbar">
                        <button className="secondary-button compact-button" type="button" onClick={onExpandAll}>
                            Expand
                        </button>
                        <button className="secondary-button compact-button" type="button" onClick={onCollapseAll}>
                            Collapse
                        </button>
                        <button className="secondary-button compact-button" type="button" onClick={onOpenManageExercises}>
                            Exercises
                        </button>
                    </div>

                    <div className="panel-body quick-body">
                        {grouped.map((part) => (
                            <BodyPartSection
                                key={part.id}
                                part={part}
                                exercises={part.exercises}
                                expanded={Boolean(expandedParts[part.id])}
                                onToggle={() => onToggleBodyPart(part.id)}
                                draftEntries={draftEntries}
                                onToggleExercise={onToggleExercise}
                                onChangeMetric={onChangeMetric}
                            />
                        ))}
                    </div>

                    <div className="sticky-summary">
                        <div>
                            <strong>{selectedCount}</strong> exercise
                            {selectedCount === 1 ? "" : "s"} queued
                        </div>
                        <div className="summary-actions">
                            <button className="secondary-button compact-button" type="button" onClick={onClearWorkout}>
                                Clear
                            </button>
                            <button
                                className="primary-button compact-button"
                                type="button"
                                disabled={selectedCount === 0 || loggingWorkout}
                                onClick={onLogWorkout}
                            >
                                {loggingWorkout ? "Logging..." : "Log workout"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </aside>
    );
}

function WorkoutTable({ entries }) {
    return (
        <div className="table-wrap">
            <table className="workout-table">
                <thead>
                    <tr>
                        <th>Exercise</th>
                        <th>Section</th>
                        <th>Sets</th>
                        <th>Reps</th>
                        <th>Weight</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={`${entry.exercise_id}-${entry.exercise_name}`}>
                            <td>{entry.exercise_name}</td>
                            <td>{entry.body_part_label}</td>
                            <td>{entry.sets}</td>
                            <td>{entry.reps}</td>
                            <td>{entry.weight}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TimelineEvent({ event }) {
    if (event.event_type === "workout") {
        return (
            <article className="timeline-card workout-event">
                <div className="timeline-topline">
                    <span className="timeline-kind">Workout</span>
                    <span className="timeline-time">{formatTimestamp(event.created_at)}</span>
                </div>
                <div className="timeline-header">
                    <div>
                        <h3>{event.author_name}</h3>
                        <p className="muted">
                            {event.exercise_count} exercises logged · volume {event.total_volume}
                        </p>
                    </div>
                </div>
                <WorkoutTable entries={event.entries} />
            </article>
        );
    }

    if (event.event_type === "protein_shake") {
        return (
            <article className="timeline-card diet-event">
                <div className="timeline-topline">
                    <span className="timeline-kind">Diet</span>
                    <span className="timeline-time">{formatTimestamp(event.created_at)}</span>
                </div>
                <h3>Protein shake</h3>
                <p className="muted">Logged with one tap.</p>
            </article>
        );
    }

    if (event.event_type === "meal") {
        return (
            <article className="timeline-card diet-event">
                <div className="timeline-topline">
                    <span className="timeline-kind">Diet</span>
                    <span className="timeline-time">{formatTimestamp(event.created_at)}</span>
                </div>
                <h3>Meal eaten</h3>
                <p className="muted">
                    High protein: {event.high_protein ? "Yes" : "No"}
                </p>
            </article>
        );
    }

    return null;
}

function TimelinePanel({
    user,
    timeline,
    loading,
    theme,
    onToggleTheme,
    onLogout,
    onRefresh,
    error,
}) {
    return (
        <main className="panel timeline-panel">
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Timeline</p>
                    <h2>Workout log</h2>
                </div>

                <div className="panel-header-actions header-tools">
                    <div className="user-chip">{user.display_name}</div>
                    <div className="icon-button-row">
                        <IconButton
                            label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                            onClick={onToggleTheme}
                        >
                            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                        </IconButton>
                        <IconButton label="Refresh" onClick={onRefresh} disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                        <IconButton label="Log out" onClick={onLogout}>
                            <LogoutIcon />
                        </IconButton>
                    </div>
                </div>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            <div className="timeline-list">
                {loading && timeline.length === 0 ? (
                    <div className="empty-state">Loading timeline...</div>
                ) : null}

                {!loading && timeline.length === 0 ? (
                    <div className="empty-state">
                        No entries yet. Build a workout or tap one of the diet actions below.
                    </div>
                ) : null}

                {timeline.map((event) => (
                    <TimelineEvent key={`${event.event_type}-${event.id}`} event={event} />
                ))}
            </div>
        </main>
    );
}

function DietTab({ onProteinShake, onMeal, logging }) {
    return (
        <div className="bottom-content">
            <section className="utility-card">
                <p className="eyebrow">Diet</p>
                <h3>One-tap logs</h3>
                <p className="muted">
                    These entries go straight into the same timeline and SQLite history.
                </p>
                <div className="diet-actions">
                    <button
                        className="primary-button compact-button"
                        type="button"
                        disabled={logging}
                        onClick={onProteinShake}
                    >
                        {logging ? "Logging..." : "Drank protein shake"}
                    </button>
                </div>
            </section>

            <section className="utility-card">
                <p className="eyebrow">Meal</p>
                <h3>Log a meal</h3>
                <p className="muted">
                    Records the timestamp and whether the meal was high protein.
                </p>
                <div className="diet-actions">
                    <button
                        className="secondary-button compact-button"
                        type="button"
                        disabled={logging}
                        onClick={() => onMeal(true)}
                    >
                        Meal eaten · high protein
                    </button>
                    <button
                        className="secondary-button compact-button"
                        type="button"
                        disabled={logging}
                        onClick={() => onMeal(false)}
                    >
                        Meal eaten · not high protein
                    </button>
                </div>
            </section>
        </div>
    );
}

function CalendarTab({ calendar, onPreviousMonth, onNextMonth, loading }) {
    const totalDays = daysInMonth(calendar.year, calendar.month_number);
    const offset = weekdayOffset(calendar.year, calendar.month_number);
    const cells = [];

    for (let index = 0; index < offset; index += 1) {
        cells.push(<div key={`blank-${index}`} className="calendar-cell empty" />);
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const workedOut = calendar.workout_days.includes(day);
        cells.push(
            <div key={day} className={`calendar-cell ${workedOut ? "worked-out" : ""}`}>
                <span className="calendar-day-number">{day}</span>
                <span className="calendar-marker">{workedOut ? "x" : ""}</span>
            </div>
        );
    }

    return (
        <div className="bottom-content">
            <section className="utility-card calendar-card">
                <div className="calendar-header">
                    <div>
                        <p className="eyebrow">Workout Calendar</p>
                        <h3>{formatMonthLabel(calendar.month)}</h3>
                    </div>

                    <div className="calendar-actions">
                        <button className="secondary-button compact-button" type="button" onClick={onPreviousMonth} disabled={loading}>
                            Prev
                        </button>
                        <button className="secondary-button compact-button" type="button" onClick={onNextMonth} disabled={loading}>
                            Next
                        </button>
                    </div>
                </div>

                <div className="calendar-weekdays">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>

                <div className="calendar-grid">{cells}</div>
                <p className="tiny-note">Green x marks a day with at least one logged workout.</p>
            </section>
        </div>
    );
}

function BottomPanel({
    activeTab,
    onChangeTab,
    calendar,
    calendarLoading,
    dietLogging,
    onProteinShake,
    onMeal,
    onPreviousMonth,
    onNextMonth,
}) {
    return (
        <section className="panel bottom-panel">
            <div className="bottom-nav">
                <button
                    className={`nav-pill ${activeTab === "diet" ? "active" : ""}`}
                    type="button"
                    onClick={() => onChangeTab("diet")}
                >
                    Diet
                </button>
                <button
                    className={`nav-pill ${activeTab === "calendar" ? "active" : ""}`}
                    type="button"
                    onClick={() => onChangeTab("calendar")}
                >
                    Calendar
                </button>
            </div>

            {activeTab === "diet" ? (
                <DietTab
                    onProteinShake={onProteinShake}
                    onMeal={onMeal}
                    logging={dietLogging}
                />
            ) : (
                <CalendarTab
                    calendar={calendar}
                    onPreviousMonth={onPreviousMonth}
                    onNextMonth={onNextMonth}
                    loading={calendarLoading}
                />
            )}
        </section>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div className="modal-backdrop" role="presentation" onClick={onClose}>
            <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div>
                        <p className="eyebrow">Manage</p>
                        <h3>{title}</h3>
                    </div>
                    <button className="secondary-button compact-button" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function ExerciseManagementModal({
    bodyParts,
    exercises,
    busyId,
    addExerciseBusy,
    addSectionBusy,
    error,
    onClose,
    onAddExercise,
    onAddSection,
    onToggleVisibility,
    onMoveExercise,
}) {
    const [exerciseName, setExerciseName] = useState("");
    const [exerciseBodyPart, setExerciseBodyPart] = useState(bodyParts[0]?.id || "");
    const [sectionLabel, setSectionLabel] = useState("");
    const [moveTargets, setMoveTargets] = useState({});

    useEffect(() => {
        if (!bodyParts.length) {
            return;
        }

        const found = bodyParts.some((part) => part.id === exerciseBodyPart);
        if (!found) {
            setExerciseBodyPart(bodyParts[0].id);
        }
    }, [bodyParts, exerciseBodyPart]);

    async function handleAddExercise(event) {
        event.preventDefault();
        const saved = await onAddExercise({
            name: exerciseName,
            body_part: exerciseBodyPart,
        });
        if (saved) {
            setExerciseName("");
        }
    }

    async function handleAddSection(event) {
        event.preventDefault();
        const saved = await onAddSection(sectionLabel);
        if (saved) {
            setSectionLabel("");
        }
    }

    return (
        <Modal title="Exercises" onClose={onClose}>
            {error ? <div className="error-banner">{error}</div> : null}

            <div className="management-forms">
                <form className="management-form-card" onSubmit={handleAddExercise}>
                    <p className="eyebrow">Add Exercise</p>
                    <label className="field">
                        <span>Exercise name</span>
                        <input
                            type="text"
                            value={exerciseName}
                            onChange={(event) => setExerciseName(event.target.value)}
                            placeholder="Example: Cable curls"
                            required
                        />
                    </label>

                    <label className="field">
                        <span>Section</span>
                        <select
                            value={exerciseBodyPart}
                            onChange={(event) => setExerciseBodyPart(event.target.value)}
                        >
                            {bodyParts.map((part) => (
                                <option key={part.id} value={part.id}>
                                    {part.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <button className="primary-button compact-button" type="submit" disabled={addExerciseBusy}>
                        {addExerciseBusy ? "Saving..." : "Add exercise"}
                    </button>
                </form>

                <form className="management-form-card" onSubmit={handleAddSection}>
                    <p className="eyebrow">Add Section</p>
                    <label className="field">
                        <span>Section name</span>
                        <input
                            type="text"
                            value={sectionLabel}
                            onChange={(event) => setSectionLabel(event.target.value)}
                            placeholder="Example: Cardio"
                            required
                        />
                    </label>

                    <button className="secondary-button compact-button" type="submit" disabled={addSectionBusy}>
                        {addSectionBusy ? "Saving..." : "Add section"}
                    </button>
                </form>
            </div>

            <div className="management-list">
                {bodyParts.map((part) => {
                    const items = exercises.filter((exercise) => exercise.body_part === part.id);

                    return (
                        <section key={part.id} className="management-group">
                            <div className="management-group-header">
                                <div>
                                    <p className="eyebrow">{part.label}</p>
                                    <strong>{part.label}</strong>
                                </div>
                                <span className="muted">{items.length} exercises</span>
                            </div>

                            {items.length ? (
                                <div className="management-items">
                                    {items.map((exercise) => {
                                        const target = moveTargets[exercise.id] || exercise.body_part;
                                        const isMoving = busyId === exercise.id;
                                        return (
                                            <div key={exercise.id} className="management-row">
                                                <div className="management-copy">
                                                    <strong>{exercise.name}</strong>
                                                    <p className="muted">
                                                        {exercise.is_active
                                                            ? "Shown in quick access"
                                                            : "Hidden from quick access"}
                                                        {exercise.is_custom ? " · custom" : ""}
                                                    </p>
                                                </div>

                                                <div className="management-controls">
                                                    <select
                                                        className="management-select"
                                                        value={target}
                                                        disabled={isMoving}
                                                        onChange={(event) =>
                                                            setMoveTargets((current) => ({
                                                                ...current,
                                                                [exercise.id]: event.target.value,
                                                            }))
                                                        }
                                                    >
                                                        {bodyParts.map((bodyPart) => (
                                                            <option key={bodyPart.id} value={bodyPart.id}>
                                                                {bodyPart.label}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <button
                                                        className="secondary-button compact-button"
                                                        type="button"
                                                        disabled={isMoving || target === exercise.body_part}
                                                        onClick={() => onMoveExercise(exercise, target)}
                                                    >
                                                        {isMoving ? "Saving..." : "Move"}
                                                    </button>

                                                    <button
                                                        className="secondary-button compact-button"
                                                        type="button"
                                                        disabled={isMoving}
                                                        onClick={() => onToggleVisibility(exercise)}
                                                    >
                                                        {isMoving
                                                            ? "Saving..."
                                                            : exercise.is_active
                                                                ? "Hide"
                                                                : "Show"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="empty-inline">No exercises here yet.</div>
                            )}
                        </section>
                    );
                })}
            </div>
        </Modal>
    );
}

function App() {
    const initialMonth = currentMonthKey();
    const [sessionChecked, setSessionChecked] = useState(false);
    const [user, setUser] = useState(null);
    const [bodyParts, setBodyParts] = useState([]);
    const [exercises, setExercises] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [calendar, setCalendar] = useState({
        month: initialMonth,
        year: Number(initialMonth.slice(0, 4)),
        month_number: Number(initialMonth.slice(5, 7)),
        workout_days: [],
    });

    const [theme, setTheme] = useState(getInitialTheme);
    const [loginBusy, setLoginBusy] = useState(false);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [loggingWorkout, setLoggingWorkout] = useState(false);
    const [dietLogging, setDietLogging] = useState(false);
    const [authError, setAuthError] = useState("");
    const [actionError, setActionError] = useState("");

    const [quickCollapsed, setQuickCollapsed] = useState(false);
    const [expandedParts, setExpandedParts] = useState({});
    const [draftEntries, setDraftEntries] = useState({});
    const [bottomTab, setBottomTab] = useState("diet");

    const [showManageExercises, setShowManageExercises] = useState(false);
    const [manageError, setManageError] = useState("");
    const [manageBusyId, setManageBusyId] = useState(null);
    const [addExerciseBusy, setAddExerciseBusy] = useState(false);
    const [addSectionBusy, setAddSectionBusy] = useState(false);

    const calendarMonthRef = useRef(calendar.month);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("workout-theme", theme);
    }, [theme]);

    useEffect(() => {
        calendarMonthRef.current = calendar.month;
    }, [calendar.month]);

    useEffect(() => {
        loadSession();
    }, []);

    async function loadSession() {
        try {
            const payload = await apiFetch("/api/session");
            setUser(payload.user);
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setSessionChecked(true);
        }
    }

    useEffect(() => {
        if (!user) {
            setBodyParts([]);
            setExercises([]);
            setTimeline([]);
            setDraftEntries({});
            return;
        }

        loadDashboard(calendarMonthRef.current);
    }, [user]);

    async function loadDashboard(monthKey) {
        setDashboardLoading(true);
        setActionError("");
        try {
            const payload = await apiFetch(`/api/dashboard?month=${encodeURIComponent(monthKey)}`);
            setBodyParts(sortBodyParts(payload.body_parts));
            setExercises(sortExercises(payload.exercises, payload.body_parts));
            setTimeline(payload.timeline);
            setCalendar(payload.calendar);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDashboardLoading(false);
        }
    }

    async function loadCalendar(monthKey) {
        setCalendarLoading(true);
        setActionError("");
        try {
            const payload = await apiFetch(`/api/calendar?month=${encodeURIComponent(monthKey)}`);
            setCalendar(payload);
        } catch (error) {
            handleApiError(error);
        } finally {
            setCalendarLoading(false);
        }
    }

    function handleApiError(error) {
        if (error.status === 401) {
            setUser(null);
            setActionError("");
            return;
        }
        setActionError(error.message);
    }

    async function handleLogin(username, password) {
        setLoginBusy(true);
        setAuthError("");
        try {
            const payload = await apiFetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, password }),
            });
            setUser(payload.user);
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setLoginBusy(false);
            setSessionChecked(true);
        }
    }

    async function handleLogout() {
        try {
            await apiFetch("/api/logout", { method: "POST" });
        } catch (error) {
            setActionError(error.message);
        } finally {
            setUser(null);
            setShowManageExercises(false);
        }
    }

    function toggleBodyPart(partId) {
        setExpandedParts((current) => ({
            ...current,
            [partId]: !current[partId],
        }));
    }

    function expandAll() {
        const nextState = {};
        bodyParts.forEach((part) => {
            nextState[part.id] = true;
        });
        setExpandedParts(nextState);
    }

    function collapseAll() {
        setExpandedParts({});
    }

    function toggleExercise(exercise) {
        setDraftEntries((current) => {
            if (current[exercise.id]) {
                const nextEntries = { ...current };
                delete nextEntries[exercise.id];
                return nextEntries;
            }

            return {
                ...current,
                [exercise.id]: {
                    exercise_id: exercise.id,
                    sets: 1,
                    reps: 1,
                    weight: exercise.last_weight || 0,
                },
            };
        });
    }

    function changeMetric(exerciseId, field, value) {
        setDraftEntries((current) => {
            const entry = current[exerciseId];
            if (!entry) {
                return current;
            }

            return {
                ...current,
                [exerciseId]: {
                    ...entry,
                    [field]: value,
                },
            };
        });
    }

    async function logWorkout() {
        const entries = Object.values(draftEntries);
        if (!entries.length) {
            setActionError("Select at least one exercise before logging.");
            return;
        }

        setLoggingWorkout(true);
        setActionError("");
        try {
            const payload = await apiFetch("/api/workouts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ entries }),
            });
            setTimeline((current) => [payload.event, ...current]);
            setExercises((current) => sortExercises(payload.exercises, bodyParts.length ? bodyParts : current));
            setDraftEntries({});
            await loadCalendar(calendarMonthRef.current);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoggingWorkout(false);
        }
    }

    async function logProteinShake() {
        setDietLogging(true);
        setActionError("");
        try {
            const payload = await apiFetch("/api/diet/protein-shake", {
                method: "POST",
            });
            setTimeline((current) => [payload.event, ...current]);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDietLogging(false);
        }
    }

    async function logMeal(highProtein) {
        setDietLogging(true);
        setActionError("");
        try {
            const payload = await apiFetch("/api/diet/meal", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ high_protein: highProtein }),
            });
            setTimeline((current) => [payload.event, ...current]);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDietLogging(false);
        }
    }

    async function handleAddExercise(form) {
        setAddExerciseBusy(true);
        setManageError("");
        try {
            const payload = await apiFetch("/api/exercises", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });
            setExercises((current) => sortExercises([...current, payload.exercise], bodyParts));
            setExpandedParts((current) => ({
                ...current,
                [payload.exercise.body_part]: true,
            }));
            return true;
        } catch (error) {
            setManageError(error.message);
            return false;
        } finally {
            setAddExerciseBusy(false);
        }
    }

    async function handleAddSection(label) {
        setAddSectionBusy(true);
        setManageError("");
        try {
            const payload = await apiFetch("/api/body-parts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ label }),
            });
            setBodyParts((current) => sortBodyParts([...current, payload.body_part]));
            setExpandedParts((current) => ({
                ...current,
                [payload.body_part.id]: true,
            }));
            return true;
        } catch (error) {
            setManageError(error.message);
            return false;
        } finally {
            setAddSectionBusy(false);
        }
    }

    async function handleExerciseUpdate(exercise, updates) {
        setManageBusyId(exercise.id);
        setManageError("");
        try {
            const payload = await apiFetch(`/api/exercises/${exercise.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(updates),
            });

            setExercises((current) =>
                sortExercises(
                    current.map((item) =>
                        item.id === exercise.id ? payload.exercise : item
                    ),
                    bodyParts
                )
            );

            if (Object.prototype.hasOwnProperty.call(updates, "is_active") && !updates.is_active) {
                setDraftEntries((current) => {
                    if (!current[exercise.id]) {
                        return current;
                    }
                    const nextEntries = { ...current };
                    delete nextEntries[exercise.id];
                    return nextEntries;
                });
            }

            if (updates.body_part) {
                setExpandedParts((current) => ({
                    ...current,
                    [updates.body_part]: true,
                }));
            }
        } catch (error) {
            setManageError(error.message);
        } finally {
            setManageBusyId(null);
        }
    }

    function goPreviousMonth() {
        const nextMonthKey = previousMonth(calendarMonthRef.current);
        loadCalendar(nextMonthKey);
        setBottomTab("calendar");
    }

    function goNextMonth() {
        const nextMonthKey = nextMonth(calendarMonthRef.current);
        loadCalendar(nextMonthKey);
        setBottomTab("calendar");
    }

    if (!sessionChecked) {
        return (
            <div className="login-shell">
                <section className="login-card">
                    <p className="eyebrow">Training Ledger</p>
                    <h1>Loading workspace...</h1>
                </section>
            </div>
        );
    }

    if (!user) {
        return (
            <LoginScreen
                busy={loginBusy}
                error={authError}
                onSubmit={handleLogin}
            />
        );
    }

    return (
        <>
            <div className={`app-shell ${quickCollapsed ? "quick-collapsed" : ""}`}>
                <QuickPanel
                    bodyParts={bodyParts}
                    exercises={exercises}
                    expandedParts={expandedParts}
                    draftEntries={draftEntries}
                    collapsed={quickCollapsed}
                    loggingWorkout={loggingWorkout}
                    onToggleCollapsed={() => setQuickCollapsed((current) => !current)}
                    onToggleBodyPart={toggleBodyPart}
                    onExpandAll={expandAll}
                    onCollapseAll={collapseAll}
                    onToggleExercise={toggleExercise}
                    onChangeMetric={changeMetric}
                    onLogWorkout={logWorkout}
                    onClearWorkout={() => setDraftEntries({})}
                    onOpenManageExercises={() => {
                        setManageError("");
                        setShowManageExercises(true);
                    }}
                />

                <TimelinePanel
                    user={user}
                    timeline={timeline}
                    loading={dashboardLoading}
                    theme={theme}
                    onToggleTheme={() =>
                        setTheme((current) => (current === "dark" ? "light" : "dark"))
                    }
                    onLogout={handleLogout}
                    onRefresh={() => loadDashboard(calendarMonthRef.current)}
                    error={actionError}
                />

                <BottomPanel
                    activeTab={bottomTab}
                    onChangeTab={setBottomTab}
                    calendar={calendar}
                    calendarLoading={calendarLoading}
                    dietLogging={dietLogging}
                    onProteinShake={logProteinShake}
                    onMeal={logMeal}
                    onPreviousMonth={goPreviousMonth}
                    onNextMonth={goNextMonth}
                />
            </div>

            {showManageExercises ? (
                <ExerciseManagementModal
                    bodyParts={bodyParts}
                    exercises={exercises}
                    busyId={manageBusyId}
                    addExerciseBusy={addExerciseBusy}
                    addSectionBusy={addSectionBusy}
                    error={manageError}
                    onClose={() => setShowManageExercises(false)}
                    onAddExercise={handleAddExercise}
                    onAddSection={handleAddSection}
                    onToggleVisibility={(exercise) =>
                        handleExerciseUpdate(exercise, {
                            is_active: !exercise.is_active,
                        })
                    }
                    onMoveExercise={(exercise, bodyPart) =>
                        handleExerciseUpdate(exercise, {
                            body_part: bodyPart,
                        })
                    }
                />
            ) : null}
        </>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
