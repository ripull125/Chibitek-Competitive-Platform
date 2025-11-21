import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

const data = [
  { name: "A", value: 10 },
  { name: "B", value: 30 },
  { name: "C", value: 20 },
  { name: "D", value: 50 },
];

export default function RechartsTest() {
  return (
    <div style={{ padding: "2rem" }}>
      <h2>Hello World - Recharts</h2>

      <LineChart width={500} height={300} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#8884d8" />
      </LineChart>
    </div>
  );
}
