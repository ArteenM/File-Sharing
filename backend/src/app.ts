import express from "express";
import authRoutes from "./routes/auth.routes";
import fileRoutes from "./routes/file.routes";

const app = express();
app.use(express.json());
app.use("/api", authRoutes);
app.use("/api/files", fileRoutes);
export default app;
