import Constants from "expo-constants";

const localhost = "http://192.168.11.103:8000";

export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ?? localhost;

export const WS_BASE_URL = API_BASE_URL.replace("http", "ws");
