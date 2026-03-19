import { Drawer } from "expo-router/drawer";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/theme";

export default function RiderLayout() {
  return (
    <Drawer
      screenOptions={{
        drawerActiveTintColor: colors.text,
        drawerInactiveTintColor: colors.textMuted,
        drawerStyle: {
          backgroundColor: colors.background,
          width: 280,
        },
        drawerLabelStyle: {
          fontSize: 15,
          fontWeight: "600",
          marginLeft: -8,
        },
        headerStyle: { backgroundColor: colors.background, shadowColor: "transparent", elevation: 0 },
        headerTitleStyle: { fontWeight: "700", color: colors.text, fontSize: 17 },
        headerTintColor: colors.text,
      }}
    >
      <Drawer.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          drawerIcon: ({ color, size }) => <Ionicons name="locate-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen name="ride-request" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="ride-tracking" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen
        name="history"
        options={{
          title: "Ride History",
          drawerIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          title: "Settings",
          drawerIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Drawer>
  );
}
