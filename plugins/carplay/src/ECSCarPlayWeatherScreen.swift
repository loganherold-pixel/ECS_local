/**
 * ECSCarPlayWeatherScreen — CarPlay Weather Display
 *
 * Presents simplified weather intelligence on the CarPlay display.
 *
 * Common (both modes):
 *   - Current conditions (temperature, description)
 *   - Wind speed and direction
 *   - Storm movement
 *   - Weather alerts
 *
 * ExpeditionDrive extras:
 *   - Lightning risk
 *   - Wind exposure
 *   - Temperature drop forecast
 *
 * Includes fallback states for unavailable weather data.
 *
 * Architecture:
 *   - Uses CPInformationTemplate for driver-safe info display
 *   - Reads data from UserDefaults (written by RN bridge)
 *   - Does NOT modify the mobile ECS dashboard
 */

import CarPlay
import Foundation

class ECSCarPlayWeatherScreen {
    
    private static let TAG = "ECSCarPlayWeatherScreen"
    
    private var displayMode: String
    
    // Common weather data
    private var temperatureF: Double?
    private var feelsLikeF: Double?
    private var weatherMain: String?
    private var weatherDescription: String?
    private var windSpeedMph: Double?
    private var windDirection: String?
    private var humidity: Int?
    private var temperatureTrend = "unknown"
    private var stormMovement: String?
    private var alertCount = 0
    private var topAlertTitle: String?
    private var topAlertSeverity: String?
    
    // ExpeditionDrive extras
    private var lightningRisk = "unknown"
    private var windExposure = "unknown"
    private var temperatureDropForecastF: Double?
    
    // System health
    private var weatherAvailable = true
    private var weatherStaleMinutes: Int?
    
    private var infoTemplate: CPInformationTemplate?
    
    init(mode: String) {
        self.displayMode = mode
        readData()
        NSLog("[%@] Weather screen initialized", Self.TAG)
    }
    
    // MARK: - Data Reading
    
    private func readData() {
        let defaults = ECSCarPlayConstants.defaults()
        displayMode = defaults.string(forKey: ECSCarPlayConstants.keyDisplayMode) ?? displayMode
        
        // Read weather data
        if let weatherData = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keyWeatherData) {
            temperatureF = weatherData["temperatureF"] as? Double
            feelsLikeF = weatherData["feelsLikeF"] as? Double
            weatherMain = weatherData["weatherMain"] as? String
            weatherDescription = weatherData["weatherDescription"] as? String
            windSpeedMph = weatherData["windSpeedMph"] as? Double
            windDirection = weatherData["windDirection"] as? String
            humidity = weatherData["humidity"] as? Int
            temperatureTrend = weatherData["temperatureTrend"] as? String ?? "unknown"
            stormMovement = weatherData["stormMovement"] as? String
            
            lightningRisk = weatherData["lightningRisk"] as? String ?? "unknown"
            windExposure = weatherData["windExposure"] as? String ?? "unknown"
            temperatureDropForecastF = weatherData["temperatureDropForecastF"] as? Double
            
            if let alerts = weatherData["weatherAlerts"] as? [[String: Any]] {
                alertCount = alerts.count
                if let first = alerts.first {
                    topAlertTitle = first["title"] as? String
                    topAlertSeverity = first["severity"] as? String
                }
            } else {
                alertCount = 0
                topAlertTitle = nil
                topAlertSeverity = nil
            }
        }
        
        // Read system health for weather availability
        if let health = ECSCarPlayConstants.readJSON(ECSCarPlayConstants.keySystemHealth) {
            if let weather = health["weather"] as? [String: Any] {
                weatherAvailable = weather["available"] as? Bool ?? true
                weatherStaleMinutes = weather["staleSinceMinutes"] as? Int
            }
        }
    }
    
    // MARK: - Template Building
    
    func buildTemplate() -> CPInformationTemplate {
        let items = buildItems()
        let title = displayMode == "expedition_drive" ? "EXPEDITION WEATHER" : "WEATHER"
        let template = CPInformationTemplate(
            title: title,
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
            template.title = displayMode == "expedition_drive" ? "EXPEDITION WEATHER" : "WEATHER"
            template.items = buildItems()
        }
    }
    
    // MARK: - Items
    
    private func buildItems() -> [CPInformationItem] {
        // Check if weather data is available
        let hasData = temperatureF != nil || weatherMain != nil || windSpeedMph != nil
        
        if !hasData && !weatherAvailable {
            return buildFallbackItems()
        }
        
        if displayMode == "expedition_drive" {
            return buildExpeditionItems()
        } else {
            return buildHighwayItems()
        }
    }
    
    private func buildHighwayItems() -> [CPInformationItem] {
        var items: [CPInformationItem] = []
        
        // Current Conditions
        let tempText = temperatureF != nil ? "\(Int(temperatureF!.rounded()))°F" : "Temperature unavailable"
        let condSubtext = buildConditionSubtext()
        items.append(CPInformationItem(title: "Current: \(tempText)", detail: condSubtext))
        
        // Wind
        let windText = windSpeedMph != nil ? "\(Int(windSpeedMph!.rounded())) mph" : "Wind data unavailable"
        let windSub = windDirection != nil ? "Direction: \(windDirection!)" : "Direction unknown"
        items.append(CPInformationItem(title: "Wind: \(windText)", detail: windSub))
        
        // Storm Movement
        let stormText = stormMovement ?? "None detected"
        items.append(CPInformationItem(title: "Storm Movement", detail: stormText))
        
        // Weather Alerts
        let alertText: String
        if alertCount > 0 {
            let severity = topAlertSeverity?.uppercased() ?? "ALERT"
            alertText = "\(alertCount) active \u{2022} \(severity): \(topAlertTitle ?? "Weather alert")"
        } else {
            alertText = "No active alerts"
        }
        items.append(CPInformationItem(title: "Alerts", detail: alertText))
        
        // Stale data indicator
        if let staleMin = weatherStaleMinutes, staleMin > 5 {
            items.append(CPInformationItem(title: "Data Age", detail: "Last updated \(staleMin) min ago"))
        }
        
        return items
    }
    
    private func buildExpeditionItems() -> [CPInformationItem] {
        var items: [CPInformationItem] = []
        
        // Current Conditions
        let tempText = temperatureF != nil ? "\(Int(temperatureF!.rounded()))°F" : "Temperature unavailable"
        let condSubtext = buildConditionSubtext()
        items.append(CPInformationItem(title: "Current: \(tempText)", detail: condSubtext))
        
        // Wind + Exposure
        let windText = windSpeedMph != nil ? "\(Int(windSpeedMph!.rounded())) mph \(windDirection ?? "")" : "Wind data unavailable"
        items.append(CPInformationItem(title: "Wind: \(windText)", detail: "Exposure: \(windExposure.uppercased())"))
        
        // Lightning Risk + Storm
        let stormText: String
        if let storm = stormMovement {
            stormText = "Storm: \(storm)"
        } else {
            stormText = "No storms detected"
        }
        items.append(CPInformationItem(title: "Lightning: \(lightningRisk.uppercased())", detail: stormText))
        
        // Temperature Drop Forecast
        let tempDropText: String
        if let drop = temperatureDropForecastF {
            tempDropText = "-\(Int(abs(drop.rounded())))°F expected drop"
        } else {
            tempDropText = "No significant change expected"
        }
        items.append(CPInformationItem(title: "Temp Forecast", detail: "\(tempDropText) \u{2022} Trend: \(temperatureTrend.uppercased())"))
        
        // Weather Alerts
        if alertCount > 0 {
            let severity = topAlertSeverity?.uppercased() ?? "ALERT"
            items.append(CPInformationItem(
                title: "\(alertCount) Active Alert\(alertCount > 1 ? "s" : "")",
                detail: "\(severity): \(topAlertTitle ?? "Weather alert")"
            ))
        }
        
        return items
    }
    
    private func buildFallbackItems() -> [CPInformationItem] {
        var items: [CPInformationItem] = []
        
        items.append(CPInformationItem(title: "Weather Unavailable", detail: "Check connection"))
        
        if let staleMin = weatherStaleMinutes {
            items.append(CPInformationItem(title: "Last Update", detail: "\(staleMin) min ago"))
        }
        
        return items
    }
    
    // MARK: - Helpers
    
    private func buildConditionSubtext() -> String {
        var parts: [String] = []
        
        if let desc = weatherDescription {
            parts.append(desc)
        } else if let main = weatherMain {
            parts.append(main)
        }
        
        if let feels = feelsLikeF {
            parts.append("Feels \(Int(feels.rounded()))°F")
        }
        
        if let hum = humidity {
            parts.append("Humidity \(hum)%")
        }
        
        return parts.isEmpty ? "No data available" : parts.joined(separator: " \u{2022} ")
    }
}
