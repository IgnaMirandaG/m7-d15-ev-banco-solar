import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import pool from './database/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = 3000;

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});

//MIDDLEWARES GENERALES:
app.use(morgan("tiny"));
app.use(express.json());
//dejar pública carperta public
app.use(express.static("public"));

//ruta principal -> GET: Devuelve la aplicación cliente
app.get(["/", "/home", "/inicio"], (req, res) => {
    res.sendFile(path.resolve(__dirname, "./public/index.html"));
});

//ENDPOINTS:

// /usuarios GET: Devuelve todos los usuarios registrados con sus balances
app.get("/usuarios", async (req, res) => {
    try {
        const consulta = {
            text: "SELECT * FROM USUARIOS",
            values: []
        };
        const results = await pool.query(consulta);
        res.json(results.rows);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Error interno del servidor."
        });
    }
});

// /usuario POST: Recibe los datos de un nuevo usuario y los almacena en PostgreSQL
app.post("/usuario", async (req, res) => {
    const { nombre, balance } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO usuarios (nombre, balance) VALUES ($1, $2) RETURNING id, nombre, balance',
            [nombre, balance]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            error: 'Error al crear el usuario'
        });
    }
});

// /usuario PUT: Recibe los datos modificados de un usuario registrado y los actualiza
app.put("/usuario", async (req, res) => {
    const { id } = req.query;
    const { name, balance } = req.body;
    try {
        const result = await pool.query(
            'UPDATE usuarios SET nombre = $1, balance = $2 WHERE id = $3 RETURNING id, nombre, balance',
            [name, balance, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Usuario no encontrado'
            });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            error: 'Error al actualizar el usuario'
        });
    }
});

// /usuario DELETE: Recibe el id de un usuario registrado y lo elimina
app.delete("/usuario", async (req, res) => {
    const { id } = req.query;
    try {
        const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json({
            message: 'Usuario eliminado exitosamente'
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            error: 'Error al eliminar el usuario'
        });
    }
});

// /transferencias GET: Devuelve todas las transferencias almacenadas en la base de datos
app.get("/transferencias", async (req, res) => {
    try {
        const consulta = {
            text: `SELECT t.id, e.nombre AS emisor, r.nombre AS receptor, t.monto, t.fecha FROM TRANSFERENCIAS AS t
              INNER JOIN USUARIOS AS e ON t.emisor = e.id
              INNER JOIN USUARIOS AS r ON t.receptor = r.id;
      `,
            values: [],
            rowMode: 'array'
        };
        const results = await pool.query(consulta);
        res.json(results.rows);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Error interno del servidor."
        });
    }
});

// /transferencia POST: Recibe los datos para realizar una nueva transferencia
app.post("/transferencia", async (req, res) => {
    try {
        const { emisor, receptor, monto } = req.body;
        //inicio de la transacción
        await pool.query("BEGIN");

        //1.- Descontar dinero emisor
        await pool.query("UPDATE USUARIOS SET BALANCE = BALANCE - $1 WHERE ID = $2", [monto, emisor]);

        //2.- Sumar dinero al receptor
        await pool.query("UPDATE USUARIOS SET BALANCE = BALANCE + $1 WHERE ID = $2", [monto, receptor]);

        //3.- Registrar transacción
        await pool.query("INSERT INTO Transferencias VALUES(DEFAULT, $1, $2, $3, NOW())", [emisor, receptor, monto]);
        
        //confirmar la transacción
        await pool.query("COMMIT");
        res.json({ message: "Transferencia realizada con éxito" });
    } catch (error) {
        //revertir la transacción en caso de error
        await pool.query("ROLLBACK");

        if (error.code == "23514") {
            return res.status(400).json({
                message: "La cuenta del emisor no tiene saldo suficiente"
            });
        }

        console.log(error);
        res.status(500).json({
            message: "Error interno del servidor."
        });
    }
});

// RUTA NOT FOUND
app.all("*", (req, res) => {
    res.status(404).json({
        message: "Ruta desconocida."
    });
});

