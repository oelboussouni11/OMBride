import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../constants/theme";

export default function DriverLayout() {
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
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>&#x1F4B0;</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>&#x1F4C4;</Text>
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
