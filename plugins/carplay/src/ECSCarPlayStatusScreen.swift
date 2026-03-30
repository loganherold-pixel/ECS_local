/**
 * ECSCarPlayStatusScreen — CarPlay Status Display
 *
 * Presents a simplified trip or expedition summary on the CarPlay
 * display depending on the active VehicleDisplayMode.
 *
 * HighwayDrive:
 *   - Trip distance
 *   - Trip duration
 *   - Daylight remaining
 *   - Connectivity forecast
 *
 * ExpeditionDrive:
 *   - Remoteness index
 *   - Distance from start (breadcrumb tracker)
 *   - Elevation gain
 *   - Vehicle systems summary
 *   - Weather risk
 *
 * Includes mode indicator and fallback states for missing data.
 *
 * Architecture:
 *   - Uses CPInformationTemplate for driver-safe info display
 *   - Reads data from UserDefaults (written by RN bridge)
 *   - Does NOT modify the mobile ECS dashboard
 */

import CarPlay
import Foundation

class ECSCarPlayStatusScreen {
    
    private static let TAG = "ECSCarPlayStatusScreen"
    
    private var displayMode: String
    
    // HighwayDrive data
    private var tripDistanceMi: Double?
    private var tripDurationHrs: Double?
    private var daylightRemainingHrs: Double?
    private var connectivityForecast = "unknown"
    
    // ExpeditionDrive data
    private var remotenessIndex: Int?
    private var remotenessTier: String?
    private var distanceFromStartMi: Double?
    private var elevationGainFt: Int?
    private var weatherRisk = "unknown"
    private var vehicleSystemsCount = 0
    private var vehicleSystemsNominal = 0
    
    // Breadcrumb data
    private var breadcrumbPointCount = 0
    private var breadcrumbIsRecording = false
    private var breadcrumbCanReturnToStart = false
    
    // Mode state
    private var isManualOverride = false
    private var transitionNoticeMessage: String?
    private var transitionNoticeTimestamp: Double = 0
    
    private var infoTemplate: CPInformationTemplate?
    
    init(mode: String) {
        self.displayMode = mode
        readData()
        NSLog("[%@] Status screen initialized", Self.TAG)
    }
    
    // MARK: - Data Reading
    
    private func readData() {
        let defaults = ECSCarPlayConstants.defaults()
        displayMode = defaults.string(forKey: ECSCarPlayConstants.keyDisplayMode) ?? displayMode
        
        // Read status data
        if let statusData = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keyStatusData) {
            tripDistanceMi = statusData["tripDistanceMiles"] as? Double
            tripDurationHrs = statusData["tripDurationHours"] as? Double
            daylightRemainingHrs = statusData["daylightRemainingHours"] as? Double
            connectivityForecast = statusData["connectivityForecast"] as? String ?? "unknown"
            remotenessIndex = statusData["remotenessIndex"] as? Int
            remotenessTier = statusData["remotenessTier"] as? String
            distanceFromStartMi = statusData["distanceFromStartMiles"] as? Double
            elevationGainFt = statusData["elevationGainFt"] as? Int
            weatherRisk = statusData["weatherRisk"] as? String ?? "unknown"
            
            if let systems = statusData["vehicleSystemsSummary"] as? [[String: Any]] {
                vehicleSystemsCount = systems.count
                vehicleSystemsNominal = systems.filter { ($0["status"] as? String) == "nominal" }.count
            }
        }
        
        // Read breadcrumb data
        if let bcData = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keyBreadcrumbData) {
            breadcrumbPointCount = bcData["pointCount"] as? Int ?? 0
            breadcrumbIsRecording = bcData["isRecording"] as? Bool ?? false
            breadcrumbCanReturnToStart = bcData["canReturnToStart"] as? Bool ?? false
            if let bcDist = bcData["distanceFromStartMi"] as? Double {
                distanceFromStartMi = bcDist
            }
        }
        
        // Read mode state
        if let modeState = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keyModeState) {
            isManualOverride = modeState["isManualOverride"] as? Bool ?? false
            if let notice = modeState["transitionNotice"] as? [String: Any] {
                transitionNoticeMessage = notice["message"] as? String
                transitionNoticeTimestamp = notice["timestamp"] as? Double ?? 0
            } else {
                transitionNoticeMessage = nil
            }
        }
    }
    
    // MARK: - Template Building
    
    func buildTemplate() -> CPInformationTemplate {
        let items = buildItems()
        let template = CPInformationTemplate(
            title: buildTitle(),
            layout: .leading,
            items: items,
            actions: []
        )
        
        infoTemplate = template
        return template
    }
    
    func refresh(mode: String) {
        self.displayMode = mode
        readData()
        
        if let template = infoTemplate {
            template.title = buildTitle()
            template.items = buildItems()
        }
    }
    
    // MARK: - Title
    
    private func buildTitle() -> String {
        let modeTag = displayMode == "expedition_drive" ? "EXP" : "HWY"
        let overrideTag = isManualOverride ? " (Manual)" : ""
        let baseTitle = displayMode == "expedition_drive" ? "EXPEDITION STATUS" : "TRIP STATUS"
        return "\(baseTitle) \u{2022} \(modeTag)\(overrideTag)"
    }
    
    // MARK: - Items
    
    private func buildItems() -> [CPInformationItem] {
        var items: [CPInformationItem] = []
        
        // Transition notice
        if let notice = transitionNoticeMessage, hasActiveTransitionNotice() {
            items.append(CPInformationItem(title: notice, detail: nil))
        }
        
        if displayMode == "expedition_drive" {
            items.append(contentsOf: buildExpeditionItems())
        } else {
            items.append(contentsOf: buildHighwayItems())
        }
        
        return items
    }
    
    private func buildHighwayItems() -> [CPInformationItem] {
        var items: [CPInformationItem] = []
        
        // Trip Distance
        let distText = tripDistanceMi != nil ? String(format: "%.1f mi", tripDistanceMi!) : "Trip data unavailable"
        items.append(CPInformationItem(title: "Trip Distance", detail: distText))
        
        // Trip Duration
        let durText: String
        if let hrs = tripDurationHrs {
            durText = hrs < 1.0 ? "\(Int(hrs * 60)) min" : String(format: "%.1f hrs", hrs)
        } else {
            durText = "Duration unavailable"
        }
        items.append(CPInformationItem(title: "Trip Duration", detail: durText))
        
        // Daylight Remaining
        let dayText = daylightRemainingHrs != nil ? String(format: "%.1f hrs", daylightRemainingHrs!) : "Daylight data unavailable"
        items.append(CPInformationItem(title: "Daylight Remaining", detail: dayText))
        
        // Connectivity
        items.append(CPInformationItem(title: "Connectivity", detail: connectivityForecast.uppercased()))
        
        return items
    }
    
    private func buildExpeditionItems() -> [CPInformationItem] {
        var items: [CPInformationItem] = []
        
        // Remoteness
        let remoteText: String
        if let idx = remotenessIndex {
            let tier = remotenessTier ?? ""
            remoteText = "\(idx) \(tier)"
        } else {
            remoteText = "Remoteness unavailable"
        }
        items.append(CPInformationItem(title: "Remoteness", detail: remoteText))
        
        // Distance from Start
        let distStartText: String
        if let dist = distanceFromStartMi {
            let bcStatus = breadcrumbIsRecording ? "\(breadcrumbPointCount) pts recorded" :
                (breadcrumbPointCount > 0 ? "Recording paused" : "No breadcrumbs")
            distStartText = String(format: "%.1f mi \u{2022} %@", dist, bcStatus)
        } else {
            distStartText = "Distance unavailable"
        }
        items.append(CPInformationItem(title: "Distance from Start", detail: distStartText))
        
        // Elevation Gain
        let elevText = elevationGainFt != nil ? "\(elevationGainFt!) ft" : "Elevation unavailable"
        items.append(CPInformationItem(title: "Elevation Gain", detail: elevText))
        
        // Vehicle Systems
        let sysText = vehicleSystemsCount > 0 ?
            "\(vehicleSystemsNominal) / \(vehicleSystemsCount) nominal" :
            "Vehicle systems unavailable"
        items.append(CPInformationItem(title: "Vehicle Systems", detail: sysText))
        
        // Weather Risk
        items.append(CPInformationItem(title: "Weather Risk", detail: weatherRisk.uppercased()))
        
        return items
    }
    
    // MARK: - Helpers
    
    private func hasActiveTransitionNotice() -> Bool {
        guard transitionNoticeMessage != nil else { return false }
        let now = Date().timeIntervalSince1970 * 1000
        return now - transitionNoticeTimestamp < 5000
    }
}
