package mx.lealtad.gasolineras

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import mx.lealtad.gasolineras.ui.AppRoot
import mx.lealtad.gasolineras.ui.theme.LealtadTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LealtadTheme { AppRoot() }
        }
    }
}
