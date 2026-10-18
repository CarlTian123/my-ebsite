import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let win = UIWindow(frame: UIScreen.main.bounds)
        win.rootViewController = ViewController()
        win.makeKeyAndVisible()
        window = win

        // 游戏里不要息屏
        application.isIdleTimerDisabled = true
        return true
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        return .landscape
    }
}
