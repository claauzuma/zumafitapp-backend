import { MongoClient } from "mongodb"
import dns from "node:dns"
import config from '../config.js'

// Algunas instalaciones de Windows dejan a Node apuntando a 127.0.0.1 como
// DNS aunque no haya un resolvedor local activo. Eso impide resolver las URI
// mongodb+srv (ECONNREFUSED), aun cuando el DNS de Windows funciona bien.
const asegurarDnsParaMongoSrv = () => {
    if (!config.STRCNX.startsWith("mongodb+srv://")) return

    const servidores = dns.getServers()
    const soloLocales = servidores.length > 0 && servidores.every(servidor =>
        servidor === "127.0.0.1" || servidor === "::1"
    )

    if (soloLocales) {
        dns.setServers(["1.1.1.1", "8.8.8.8"])
        console.log("DNS local no disponible; usando DNS público para resolver MongoDB.")
    }
}

class CnxMongoDB {
    static client = null
    static connection = false
    static db = null

    static conectar = async _ => {
        try {
            console.log('Conectando a la base de datos...')
            asegurarDnsParaMongoSrv()
            CnxMongoDB.client = new MongoClient(config.STRCNX)
            await CnxMongoDB.client.connect()
            console.log('Base de datos conectada!')

            CnxMongoDB.db = CnxMongoDB.client.db(config.BASE)
            CnxMongoDB.connection = true
        }
        catch(error) {
            console.log(`Error en la conexión de base de datos: ${error.message}`)
        }
    }

    static desconectar = async _ => {
        if(!CnxMongoDB.connection) return
        await CnxMongoDB.client.close()
        CnxMongoDB.connection = false

        
    }
}

export default CnxMongoDB
