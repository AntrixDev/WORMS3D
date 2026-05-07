import './button.css'

interface ButtonProps {
  text: string;
  action: () => void;
  isDisabled: boolean;
}

function Button({ text, action, isDisabled }: ButtonProps){

    return (
        <button className='mainBtn' onClick={action} disabled={isDisabled}>{text}</button>
    )
}

export default Button