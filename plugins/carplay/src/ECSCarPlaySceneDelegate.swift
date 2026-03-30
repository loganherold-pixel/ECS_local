/**
 * ECSCarPlaySceneDelegate — CarPlay Scene Delegate
 *
 * Entry point when ECS launches on a CarPlay-enabled vehicle display.
 * Manages the CarPlay interface lifecycle and delegates to
 * ECSCarPlayInterfaceController for screen management.
 *
 * Registered in the iOS app configuration so the system can
 * launch ECS on CarPlay-connected vehicles.
 *
 * Architecture:
 *   - Implements CPTemplateApplicationSceneDelegate
 *   - Creates ECSCarPlayInterfaceController on connect
 *   - Notifies React Native bridge on connect/disconnect
 *   - Does NOT modify the mobile ECS dashboard
 */

import CarPlay
import Foundation

class ECSCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    
    private static let TAG = "ECSCarPlaySceneDelegate"
    
    /// The interface controller managing CarPlay screens
    var interfaceController: ECSCarPlayInterfaceController?
    
    // MARK: - CPTemplateApplicationSceneDelegate
    
    /**
     * Called when CarPlay connects.
     * Creates the interface controller and sets up the initial template.
     */
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        NSLog("[%@] CarPlay connected — initializing ECS vehicle interface", Self.TAG)
        
        // Notify RN bridge that CarPlay is connected
        notifyConnectionState(true)
        
        // Create the interface controller
        self.interfaceController = ECSCarPlayInterfaceController(
            interfaceController: interfaceController
        )
        
        // Set up the initial template (Map screen is default)
        self.interfaceController?.setupInitialTemplate()
    }
    
    /**
     * Called when CarPlay disconnects.
     * Cleans up the interface controller and notifies the bridge.
     */
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        NSLog("[%@] CarPlay disconnected — cleaning up ECS vehicle interface", Self.TAG)
        
        // Stop refresh timers
        self.interfaceController?.stop()
        self.interfaceController = nil
        
        // Notify RN bridge that CarPlay is disconnected
        notifyConnectionState(false)
    }
    
    // MARK: - Connection State
    
    /**
     * Notify the React Native side about CarPlay connection state.
     * Writes to UserDefaults so the RN bridge can detect connection changes.
     */
    private func notifyConnectionState(_ connected: Bool) {
        let defaults = ECSCarPlayConstants.defaults()
        defaults.set(connected, forKey: ECSCarPlayConstants.keyCarPlayConnected)
        defaults.set(Date().timeIntervalSince1970 * 1000, forKey: ECSCarPlayConstants.keyLastEvent)
        NSLog("[%@] CarPlay connection state: %@", Self.TAG, connected ? "connected" : "disconnected")
    }
}
