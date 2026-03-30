/**
 * ECSCarPlayActionsScreen — CarPlay Driver-Safe Actions
 *
 * Presents large, driver-safe action buttons on the CarPlay display.
 * Available actions depend on the current VehicleDisplayMode.
 *
 * HighwayDrive actions:
 *   - Add Waypoint
 *   - Quick Note
 *   - Find Fuel
 *   - Report Hazard
 *   - Navigate Home
 *
 * ExpeditionDrive actions:
 *   - Drop Waypoint
 *   - Incident Marker
 *   - Quick Note
 *   - Return to Start
 *   - Emergency Comms
 *
 * Includes:
 *   - Manual mode override control (Auto / Highway / Expedition)
 *   - Mode indicator
 *   - Transition notices
 *   - Disabled states for unavailable actions
 *
 * Architecture:
 *   - Uses CPListTemplate for driver-safe action list
 *   - Reads data from UserDefaults (written by RN bridge)
 *   - Writes actions to UserDefaults for RN bridge to consume
 *   - Does NOT modify the mobile ECS dashboard
 */

import CarPlay
import Foundation

class ECSCarPlayActionsScreen {
    
    private static let TAG = "ECSCarPlayActionsScreen"
    
    private var displayMode: String
    private weak var actionHandler: ECSCarPlayActionHandler?
    
    // Mode state
    private var modeOverride = "auto"
    private var isManualOverride = false
    private var transitionNoticeMessage: String?
    private var transitionNoticeTimestamp: Double = 0
    
    // Breadcrumb state
    private var breadcrumbCanReturnToStart = false
    private var breadcrumbDistanceFromStartMi: Double?
    
    // System health
    private var hasRoute = false
    private var hasExpedition = false
    private var hasConnectivity = true
    
    private var listTemplate: CPListTemplate?
    
    init(mode: String, actionHandler: ECSCarPlayActionHandler) {
        self.displayMode = mode
        self.actionHandler = actionHandler
        readData()
        NSLog("[%@] Actions screen initialized", Self.TAG)
    }
    
    // MARK: - Data Reading
    
    private func readData() {
        let defaults = ECSCarPlayConstants.defaults()
        displayMode = defaults.string(forKey: ECSCarPlayConstants.keyDisplayMode) ?? displayMode
        
        // Read mode state
        if let modeState = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keyModeState) {
            modeOverride = modeState["modeOverride"] as? String ?? "auto"
            isManualOverride = modeState["isManualOverride"] as? Bool ?? false
            if let notice = modeState["transitionNotice"] as? [String: Any] {
                transitionNoticeMessage = notice["message"] as? String
                transitionNoticeTimestamp = notice["timestamp"] as? Double ?? 0
            } else {
                transitionNoticeMessage = nil
            }
        }
        
        // Read breadcrumb data
        if let bcData = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keyBreadcrumbData) {
            breadcrumbCanReturnToStart = bcData["canReturnToStart"] as? Bool ?? false
            breadcrumbDistanceFromStartMi = bcData["distanceFromStartMi"] as? Double
        }
        
        // Read system health
        if let health = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keySystemHealth) {
            if let route = health["route"] as? [String: Any] {
                hasRoute = route["available"] as? Bool ?? false
            }
            if let expedition = health["expedition"] as? [String: Any] {
                hasExpedition = expedition["available"] as? Bool ?? false
            }
            if let conn = health["connectivity"] as? [String: Any] {
                hasConnectivity = conn["available"] as? Bool ?? true
            }
        }
    }
    
    // MARK: - Template Building
    
    func buildTemplate() -> CPListTemplate {
        let sections = buildSections()
        let title = buildTitle()
        let template = CPListTemplate(title: title, sections: sections)
        
        listTemplate = template
        return template
    }
    
    func refresh(mode: String) {
        self.displayMode = mode
        readData()
        
        if let template = listTemplate {
            template.updateSections(buildSections())
        }
    }
    
    // MARK: - Title
    
    private func buildTitle() -> String {
        let modeTag = displayMode == "expedition_drive" ? "EXP" : "HWY"
        let overrideTag = isManualOverride ? " (Manual)" : ""
        let baseTitle = displayMode == "expedition_drive" ? "EXPEDITION ACTIONS" : "QUICK ACTIONS"
        return "\(baseTitle) \u{2022} \(modeTag)\(overrideTag)"
    }
    
    // MARK: - Sections
    
    private func buildSections() -> [CPListSection] {
        var sections: [CPListSection] = []
        
        // Transition notice section
        if let notice = transitionNoticeMessage, hasActiveTransitionNotice() {
            let noticeItem = CPListItem(text: notice, detailText: nil)
            noticeItem.isEnabled = false
            sections.append(CPListSection(items: [noticeItem], header: "MODE CHANGE", sectionIndexTitle: nil))
        }
        
        // Mode Override section
        let modeItems = buildModeOverrideItems()
        sections.append(CPListSection(items: modeItems, header: "VEHICLE MODE", sectionIndexTitle: nil))
        
        // Actions section
        let actionItems: [CPListItem]
        if displayMode == "expedition_drive" {
            actionItems = buildExpeditionActionItems()
        } else {
            actionItems = buildHighwayActionItems()
        }
        sections.append(CPListSection(items: actionItems, header: "ACTIONS", sectionIndexTitle: nil))
        
        return sections
    }
    
    // MARK: - Mode Override
    
    private func buildModeOverrideItems() -> [CPListItem] {
        let overrideLabel: String
        switch modeOverride {
        case "highway":
            overrideLabel = "Mode: HIGHWAY (Manual)"
        case "expedition":
            overrideLabel = "Mode: EXPEDITION (Manual)"
        default:
            overrideLabel = "Mode: AUTO"
        }
        
        let nextOverride = getNextOverrideSetting()
        let item = CPListItem(text: overrideLabel, detailText: "Tap to switch to \(nextOverride.uppercased())")
        item.handler = { [weak self] _, completion in
            self?.cycleModeOverride()
            completion()
        }
        
        return [item]
    }
    
    private func getNextOverrideSetting() -> String {
        switch modeOverride {
        case "auto": return "highway"
        case "highway": return "expedition"
        case "expedition": return "auto"
        default: return "auto"
        }
    }
    
    private func cycleModeOverride() {
        let nextSetting = getNextOverrideSetting()
        NSLog("[%@] Mode override cycling: %@ -> %@", Self.TAG, modeOverride, nextSetting)
        
        modeOverride = nextSetting
        isManualOverride = nextSetting != "auto"
        
        let actionType: String
        switch nextSetting {
        case "auto": actionType = "set_mode_auto"
        case "highway": actionType = "set_mode_highway"
        case "expedition": actionType = "set_mode_expedition"
        default: actionType = "set_mode_auto"
        }
        
        actionHandler?.handleAction(actionType: actionType, label: "Mode: \(nextSetting.uppercased())")
        
        // Refresh the template
        if let template = listTemplate {
            template.updateSections(buildSections())
        }
    }
    
    // MARK: - Highway Actions
    
    private func buildHighwayActionItems() -> [CPListItem] {
        var items: [CPListItem] = []
        
        // Add Waypoint
        let waypointItem = CPListItem(text: "Add Waypoint", detailText: "Mark current location")
        waypointItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "add_waypoint", label: "Add Waypoint")
            completion()
        }
        items.append(waypointItem)
        
        // Quick Note
        let noteItem = CPListItem(text: "Quick Note", detailText: "Record a quick note")
        noteItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "quick_note", label: "Quick Note")
            completion()
        }
        items.append(noteItem)
        
        // Find Fuel
        let fuelItem = CPListItem(text: "Find Fuel", detailText: "Search nearby fuel stations")
        fuelItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "find_fuel", label: "Find Fuel")
            completion()
        }
        items.append(fuelItem)
        
        // Report Hazard
        let hazardItem = CPListItem(text: "Report Hazard", detailText: "Flag road hazard at current location")
        hazardItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "report_hazard", label: "Report Hazard")
            completion()
        }
        items.append(hazardItem)
        
        // Navigate Home
        let homeItem = CPListItem(text: "Navigate Home", detailText: hasRoute ? "Route active" : "No route set")
        homeItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "navigate_home", label: "Navigate Home")
            completion()
        }
        if !hasRoute {
            homeItem.isEnabled = false
        }
        items.append(homeItem)
        
        return items
    }
    
    // MARK: - Expedition Actions
    
    private func buildExpeditionActionItems() -> [CPListItem] {
        var items: [CPListItem] = []
        
        // Drop Waypoint
        let waypointItem = CPListItem(text: "Drop Waypoint", detailText: "Pin current position on trail")
        waypointItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "drop_waypoint", label: "Drop Waypoint")
            completion()
        }
        items.append(waypointItem)
        
        // Incident Marker
        let incidentItem = CPListItem(text: "Incident Marker", detailText: "Mark incident at current location")
        incidentItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "incident_marker", label: "Incident Marker")
            completion()
        }
        if !hasExpedition {
            incidentItem.isEnabled = false
        }
        items.append(incidentItem)
        
        // Quick Note
        let noteItem = CPListItem(text: "Quick Note", detailText: "Record a quick note")
        noteItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "quick_note", label: "Quick Note")
            completion()
        }
        items.append(noteItem)
        
        // Return to Start
        let returnSubtext: String
        if breadcrumbCanReturnToStart, let dist = breadcrumbDistanceFromStartMi {
            returnSubtext = String(format: "Navigate back — %.1f mi to start", dist)
        } else if breadcrumbCanReturnToStart {
            returnSubtext = "Navigate back to expedition start"
        } else {
            returnSubtext = "No breadcrumb trail available"
        }
        let returnItem = CPListItem(text: "Return to Start", detailText: returnSubtext)
        if breadcrumbCanReturnToStart {
            returnItem.handler = { [weak self] _, completion in
                self?.actionHandler?.handleAction(actionType: "return_to_start", label: "Return to Start")
                completion()
            }
        } else {
            returnItem.isEnabled = false
        }
        items.append(returnItem)
        
        // Emergency Comms
        let emergencyItem = CPListItem(text: "Emergency Comms", detailText: hasConnectivity ? "Send emergency signal" : "Limited connectivity")
        emergencyItem.handler = { [weak self] _, completion in
            self?.actionHandler?.handleAction(actionType: "emergency_comms", label: "Emergency Comms")
            completion()
        }
        items.append(emergencyItem)
        
        return items
    }
    
    // MARK: - Helpers
    
    private func hasActiveTransitionNotice() -> Bool {
        guard transitionNoticeMessage != nil else { return false }
        let now = Date().timeIntervalSince1970 * 1000
        return now - transitionNoticeTimestamp < 5000
    }
}
