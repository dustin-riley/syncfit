// ios/SyncFit/SyncFit/Views/HomeView.swift
import SwiftUI

struct HomeView: View {
    @EnvironmentObject var session: AppSession
    @State private var selectedDow: Int = 0
    @State private var hasInitializedSelection = false
    @State private var syncing = false
    @State private var syncError: String?
    @State private var showingInProgressAlert = false

    private static let weekdayFull = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ]

    private var resolved: ResolvedWeek? {
        guard let w = session.planWeek else { return nil }
        return PlanResolver.resolveWeek(w, now: Date(), tz: Config.appTimeZone)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if case .stale = session.planFetchStatus {
                        staleBanner
                    }
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(DSColor.bg.ignoresSafeArea())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .refreshable { await session.fetchPlan() }
            .onAppear {
                // Cache-hit case: planWeek is already set from AppSession.init
                // before first paint. Initialize selectedDow synchronously so
                // the first frame shows today selected, not Sunday.
                initializeSelectedDowIfNeeded()
            }
            .task {
                await session.fetchPlan()
                // Cold-start case: no cache, fetch completed, plan now exists.
                initializeSelectedDowIfNeeded()
            }
            // Note: deliberately no .onChange(of: session.planWeek). Once the
            // user has selected a day (programmatically or by tap), subsequent
            // refreshes preserve their selection — refreshing the plan should
            // not silently snap them back to today.
            .alert("Sync error",
                   isPresented: Binding(get: { syncError != nil },
                                        set: { if !$0 { syncError = nil } })) {
                Button("OK", role: .cancel) { syncError = nil }
            } message: {
                Text(syncError ?? "")
            }
            .alert("Finish current workout first", isPresented: $showingInProgressAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("You have an in-progress workout. Tap Resume on the Home banner or finish/discard it before starting a new one.")
            }
        }
    }

    // MARK: content

    @ViewBuilder
    private var content: some View {
        if session.planWeek == nil {
            switch session.planFetchStatus {
            case .loading, .idle:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
            case .failed:
                Text("Couldn't load your plan. Pull to refresh.")
                    .font(.system(size: 14))
                    .foregroundStyle(DSColor.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
            case .ok, .stale:
                EmptyView()
            }
        } else if session.planWeek?.days.isEmpty == true {
            Text("No plan yet. Open the web app at syncfit-chi.vercel.app to create one.")
                .font(.system(size: 13))
                .foregroundStyle(DSColor.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 24)
        } else if let r = resolved {
            if let avail = session.liveDraftAvailable {
                resumeBanner(avail)
            }
            sectionLabel("This week")
            WeekStrip(days: r.days, todayDow: r.todayDow, selectedDow: $selectedDow)
            sectionLabel(dayLabel(r: r))
            PlanDetailCard(day: r.days[selectedDow], onStart: {
                guard !session.hasInProgressWorkout else {
                    showingInProgressAlert = true
                    return
                }
                let dayToStart = r.days[selectedDow]
                if case .session(let p) = dayToStart, !p.exercises.isEmpty {
                    session.liveWorkoutStore.startFromPlan(p)
                } else {
                    session.liveWorkoutStore.startBlank()
                }
                session.presentLiveWorkoutSheet()
            })
        }
    }

    // MARK: toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            // iOS 26 Liquid Glass toolbar wraps items in an icon-button-sized
            // capsule by default; .fixedSize forces the Text to claim its
            // natural width so 'SyncFit' isn't truncated to 'S...'.
            Text("SyncFit")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(DSColor.primary)
                .fixedSize(horizontal: true, vertical: false)
        }
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 10) {
                Button {
                    Task {
                        syncing = true; defer { syncing = false }
                        syncError = nil
                        do {
                            try await session.syncNow()
                        } catch APIClientError.unauthorized {
                            syncError = "Pairing expired — re-pair this device."
                        } catch {
                            syncError = "Sync failed. Try again."
                        }
                    }
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundStyle(DSColor.text)
                }
                .disabled(syncing)

                if let d = session.lastSyncedAt {
                    Text("synced \(Self.timeOnly(d))")
                        .font(.system(size: 10))
                        .foregroundStyle(DSColor.textMuted)
                }

                Menu {
                    Button("Unpair this device", role: .destructive) {
                        session.unpair()
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(DSColor.text)
                }
            }
        }
    }

    // MARK: bits

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.72)
            .foregroundStyle(DSColor.textMuted)
            .padding(.top, 4)
    }

    private func dayLabel(r: ResolvedWeek) -> String {
        let name = Self.weekdayFull[selectedDow]
        return selectedDow == r.todayDow ? "\(name) · today" : name
    }

    // One-shot default to today's dow, gated by `hasInitializedSelection` so
    // a refresh (or a user tap) is never overwritten by a subsequent fetch.
    private func initializeSelectedDowIfNeeded() {
        guard !hasInitializedSelection, let r = resolved else { return }
        selectedDow = r.todayDow
        hasInitializedSelection = true
    }

    private func resumeBanner(_ draft: LiveWorkoutDraft) -> some View {
        Button {
            session.resumeLiveWorkout()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 14, weight: .semibold))
                Text("Resume workout — started \(Self.relativeAgo(draft.startedAt))")
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(DSColor.primary)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: DSRadius.sm)
                            .fill(DSColor.primary.opacity(0.10)))
        }
        .buttonStyle(.plain)
    }

    private var staleBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 11, weight: .semibold))
            Text("offline — last updated \(Self.relativeAgo(session.planFetchedAt))")
                .font(.system(size: 11))
        }
        .foregroundStyle(DSColor.textMuted)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.sm)
                .fill(DSColor.accentOchre.opacity(0.12))
        )
    }

    private static func relativeAgo(_ d: Date?) -> String {
        guard let d else { return "—" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: d, relativeTo: Date())
    }

    private static func timeOnly(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: d)
    }
}
