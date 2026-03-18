import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../constants/theme";

export default function RiderLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { fontWeight: "700", color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>&#x1F3E0;</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="ride-request"
        options={{
          title: "Request",
          href: null,
        }}
      />
      <Tabs.Screen
        name="ride-tracking"
        options={{
          title: "Tracking",
          href: null,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>&#x1F4CB;</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>&#x1F464;</Text>
          ),
        }}
      />
    </Tabs>
  );
}
