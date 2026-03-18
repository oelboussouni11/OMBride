import Constants from "expo-constants";

const localhost = "http://localhost:8000";

export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ?? localhost;

export const WS_BASE_URL = API_BASE_URL.replace("http", "ws");
