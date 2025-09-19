interface HeaderProps
{
  onLogout: () => void
}

const Header: React.FC<HeaderProps> = ({onLogout}) =>
{

    const handleLogout = () =>
    {
        onLogout()
    }
    return (
        <header>
            <nav>
                <ul>
                    <li><button> <a href="./pages/inputFile"/>Home </button></li>
                    <li><button onClick={handleLogout}>Logout</button></li>
                </ul>
            </nav>
        </header>
    )
}

export default Header