"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const file_routes_1 = __importDefault(require("./routes/file.routes"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use("/api", auth_routes_1.default);
app.use("/api/files", file_routes_1.default);
exports.default = app;
