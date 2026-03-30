/**
 * ECSCarPlayInterfaceController — CarPlay Screen Manager
 *
 * Manages the CarPlay vehicle display interface using a CPTabBarTemplate
 * with four tabs:
 *   - Map (default)
 *   - Status
 *   - Weather
 *   - Actions
 *
 * Reads VehicleDisplayMode from UserDefaults to determine content.
 * Refreshes screen data on a 3-second timer.
 *
 * Architecture:
 *   - Wraps CPInterfaceController
 *   - Creates and manages all four screen instances
 *   - Coordinates mode indicator and transition notices
 *   - Does NOT modify the mobile ECS dashboard
 */

import CarPlay
import Foundation

class ECSCarPlayInterfaceController: NSObject {
    
    private static let TAG = "ECSCarPlayInterfaceController"
    
    /// The CarPlay interface controller provided by the system
    private let cpInterfaceController: CPInterfaceController
    
    /// Screen instances
    private var mapScreen: ECSCarPlayMapScreen?
    private var statusScreen: ECSCarPlayStatusScreen?
    private var weatherScreen: ECSCarPlayWeatherScreen?
    private var actionsScreen: ECSCarPlayActionsScreen?
    
    /// Refresh timer
    private var refreshTimer: Timer?
    private let refreshInterval: TimeInterval = 3.0
    
    /// Current display mode
    private var displayMode: String = "highway_drive"
    
    init(interfaceController: CPInterfaceController) {
        self.cpInterfaceController = interfaceController
        super.init()
        NSLog("[%@] Interface controller initialized", Self.TAG)
    }
    
    // MARK: - Setup
    
    /**
     * Set up the initial CarPlay template.
     * Creates a tab bar with all four vehicle screens.
     * Map screen loads first as the default.
     */
    func setupInitialTemplate() {
        NSLog("[%@] Setting up initial template — Map screen as default", Self.TAG)
        
        // Read initial display mode
        readDisplayMode()
        
        // Create screen instances
        mapScreen = ECSCarPlayMapScreen(mode: displayMode)
        statusScreen = ECSCarPlayStatusScreen(mode: displayMode)
        weatherScreen = ECSCarPlayWeatherScreen(mode: displayMode)
        actionsScreen = ECSCarPlayActionsScreen(mode: displayMode, actionHandler: self)
        
        // Build templates for each screen
        guard let mapTemplate = mapScreen?.buildTemplate(),
              let statusTemplate = statusScreen?.buildTemplate(),
              let weatherTemplate = weatherScreen?.buildTemplate(),
              let actionsTemplate = actionsScreen?.buildTemplate()
        else {
            NSLog("[%@] Failed to build screen templates", Self.TAG)
            return
        }
        
        // Create tab bar
        let tabBar = CPTabBarTemplate(templates: [
            mapTemplate,
            statusTemplate,
            weatherTemplate,
            actionsTemplate
        ])
        tabBar.delegate = self
        
        // Set the root template
        cpInterfaceController.setRootTemplate(tabBar, animated: false, completion: nil)
        
        // Write active screen
        writeActiveScreen("map")
        
        // Start refresh timer
        startRefreshTimer()
    }
    
    // MARK: - Refresh
    
    private func startRefreshTimer() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }
    
    private func refresh() {
        readDisplayMode()
        
        mapScreen?.refresh(mode: displayMode)
        statusScreen?.refresh(mode: displayMode)
        weatherScreen?.refresh(mode: displayMode)
        actionsScreen?.refresh(mode: displayMode)
    }
    
    private func readDisplayMode() {
        let defaults = ECSCarPlayConstants.defaults()
        displayMode = defaults.string(forKey: ECSCarPlayConstants.keyDisplayMode) ?? "highway_drive"
    }
    
    private func writeActiveScreen(_ screen: String) {
        let defaults = ECSCarPlayConstants.defaults()
        defaults.set(screen, forKey: ECSCarPlayConstants.keyActiveScreen)
    }
    
    // MARK: - Lifecycle
    
    func stop() {
        refreshTimer?.invalidate()
        refreshTimer = nil
        mapScreen = nil
        statusScreen = nil
        weatherScreen = nil
        actionsScreen = nil
        NSLog("[%@] Interface controller stopped", Self.TAG)
    }
}

// MARK: - CPTabBarTemplateDelegate

extension ECSCarPlayInterfaceController: CPTabBarTemplateDelegate {
    func tabBarTemplate(_ tabBarTemplate: CPTabBarTemplate, didSelect selectedTemplate: CPTemplate) {
        // Determine which tab was selected
        if let templates = tabBarTemplate.templates as? [CPTemplate],
           let index = templates.firstIndex(where: { $0 === selectedTemplate }) {
            let screenNames = ["map", "status", "weather", "actions"]
            if index < screenNames.count {
                writeActiveScreen(screenNames[index])
                NSLog("[%@] Tab selected: %@", Self.TAG, screenNames[index])
            }
        }
    }
}

// MARK: - Action Handler Protocol

extension ECSCarPlayInterfaceController: ECSCarPlayActionHandler {
    func handleAction(actionType: String, label: String) {
        NSLog("[%@] Action triggered: %@ (%@)", Self.TAG, actionType, label)
        
        let defaults = ECSCarPlayConstants.defaults()
        let actionData: [String: Any] = [
            "actionType": actionType,
            "label": label,
            "timestamp": Date().timeIntervalSince1970 * 1000,
            "mode": displayMode,
            "source": "carplay"
        ]
        
        ECSCarPlayConstants.writeJSON(ECSCarPlayConstants.keyPendingAction, value: actionData)
        defaults.set(Date().timeIntervalSince1970 * 1000, forKey: ECSCarPlayConstants.keyLastEvent)
    }
}

/// Protocol for action handling from CarPlay screens
protocol ECSCarPlayActionHandler: AnyObject {
    func handleAction(actionType: String, label: String)
}
