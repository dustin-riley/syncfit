import SwiftUI

struct LogView: View {
    @EnvironmentObject var session: AppSession
    @State private var pickingDay = false

    private static let weekdayFull = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ]

    var body: some View {
        NavigationStack {
            List {
                if session.liveDraftAvailable != nil {
                    Section {
                        Button {
                            session.resumeLiveWorkout()
                        } label: {
                            HStack {
                                Image(systemName: "play.circle.fill")
                                    .foregroundStyle(DSColor.primary)
                                Text("Resume in-progress workout")
                                    .foregroundStyle(DSColor.text)
                            }
                        }
                    }
                }
                Section("Start a workout") {
                    Button {
                        if let today = todayPlanDay() {
                            session.liveWorkoutStore.startFromPlan(today)
                            session.presentLiveWorkoutSheet()
                        }
                    } label: {
                        Text("Start today's workout")
                    }
                    .disabled(todayPlanDay()?.exercises.isEmpty ?? true)

                    Button {
                        pickingDay = true
                    } label: {
                        Text("Pick another day's plan")
                    }
                    .disabled(session.planWeek == nil)

                    Button {
                        session.liveWorkoutStore.startBlank()
                        session.presentLiveWorkoutSheet()
                    } label: {
                        Text("Start blank workout")
                    }
                }
            }
            .navigationTitle("Log")
            .sheet(isPresented: $pickingDay) {
                NavigationStack {
                    List {
                        if let week = session.planWeek {
                            ForEach(week.days, id: \.dayOfWeek) { day in
                                Button {
                                    session.liveWorkoutStore.startFromPlan(day)
                                    session.presentLiveWorkoutSheet()
                                    pickingDay = false
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(Self.weekdayFull[day.dayOfWeek])
                                            .font(.system(size: 14, weight: .bold))
                                        if !day.title.isEmpty {
                                            Text(day.title)
                                                .font(.system(size: 12))
                                                .foregroundStyle(DSColor.textMuted)
                                        }
                                    }
                                }
                                .disabled(day.exercises.isEmpty)
                            }
                        }
                    }
                    .navigationTitle("Pick a day")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { pickingDay = false }
                        }
                    }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func todayPlanDay() -> PlanDay? {
        guard let w = session.planWeek else { return nil }
        let cal = Calendar(identifier: .gregorian)
        var c = cal; c.timeZone = Config.appTimeZone
        let dow = c.component(.weekday, from: Date()) - 1 // 0..6
        return w.days.first(where: { $0.dayOfWeek == dow })
    }
}
