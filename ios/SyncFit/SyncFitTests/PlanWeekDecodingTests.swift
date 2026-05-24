import XCTest
@testable import SyncFit

final class PlanWeekDecodingTests: XCTestCase {

    func testDecodesFullResponse() throws {
        let json = """
        {
          "days": [
            {
              "dayOfWeek": 3,
              "title": "Heavy lifts",
              "notes": "focus on back squat",
              "modality": "strength",
              "exercises": [
                { "id": "ex-1", "name": "Back squat", "targetSets": 4, "targetReps": 5, "targetWeight": 245 }
              ]
            }
          ]
        }
        """.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertEqual(week.days.count, 1)
        XCTAssertEqual(week.days[0].dayOfWeek, 3)
        XCTAssertEqual(week.days[0].title, "Heavy lifts")
        XCTAssertEqual(week.days[0].notes, "focus on back squat")
        XCTAssertEqual(week.days[0].modality, "strength")
        XCTAssertEqual(week.days[0].exercises.count, 1)
        XCTAssertEqual(week.days[0].exercises[0].id, "ex-1")
        XCTAssertEqual(week.days[0].exercises[0].name, "Back squat")
        XCTAssertEqual(week.days[0].exercises[0].targetSets, 4)
        XCTAssertEqual(week.days[0].exercises[0].targetReps, 5)
        XCTAssertEqual(week.days[0].exercises[0].targetWeight, 245.0)
    }

    func testDecodesEmptyDays() throws {
        let json = #"{"days":[]}"#.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertTrue(week.days.isEmpty)
    }

    func testDecodesEmptyExercises() throws {
        let json = """
        {"days":[{"dayOfWeek":0,"title":"","notes":"","modality":"rest","exercises":[]}]}
        """.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertEqual(week.days[0].exercises.count, 0)
    }

    func testDecodesDecimalWeight() throws {
        let json = """
        {"days":[
          {"dayOfWeek":1,"title":"L","notes":"","modality":"strength",
           "exercises":[{"id":"x","name":"Press","targetSets":3,"targetReps":10,"targetWeight":47.5}]}
        ]}
        """.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertEqual(week.days[0].exercises[0].targetWeight, 47.5)
    }

    func testRoundTripsViaEncoder() throws {
        let week = PlanWeek(days: [
            .init(dayOfWeek: 2, title: "Tempo bike", notes: "z3", modality: "endurance", exercises: [])
        ])
        let data = try JSONEncoder().encode(week)
        let back = try JSONDecoder().decode(PlanWeek.self, from: data)
        XCTAssertEqual(back, week)
    }
}
