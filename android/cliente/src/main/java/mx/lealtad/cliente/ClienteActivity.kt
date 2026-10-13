package mx.lealtad.cliente

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import mx.lealtad.cliente.ui.ClienteApp
import mx.lealtad.cliente.ui.theme.ClienteTheme

/** App del cliente: solo el portal (puntos, dinero virtual, promociones, cupones y Rasca y Gana). */
class ClienteActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ClienteTheme { ClienteApp() } }
    }
}
